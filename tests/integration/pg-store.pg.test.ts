import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PgStore, createStore } from '@sen/db';
import type { RuleDefinition } from '@sen/shared';

let store: PgStore;
const url = process.env.PG_TEST_URL!;

beforeAll(async () => {
  store = await PgStore.connect(url);
});

afterAll(async () => {
  await store.close();
});

function baseRule(id: string, version: number, status: RuleDefinition['status'], method = '입찰'): RuleDefinition {
  return {
    id,
    version,
    status,
    scope: { contract_category: 'construction' },
    conditions: [{ field: 'estimated_price', operator: 'between', value: [0, 0] }],
    output: { method, reviewRequired: true },
    source: { title: 't', url: 'https://example.org', effectiveFrom: null, checkedAt: '2026-08-25' },
    reviewedBy: null,
    supersededBy: null,
    createdAt: '2026-08-25T00:00:00Z',
    updatedAt: '2026-08-25T00:00:00Z'
  };
}

function user(username: string, role: 'USER' | 'REVIEWER' | 'ADMIN') {
  return { username, passwordHash: 's:h', displayName: username, role };
}

type TestPool = { query: (text: string, values?: unknown[]) => Promise<unknown> };

function poolForTest(): TestPool {
  return (store as unknown as { pool: TestPool }).pool;
}

describe('PgStore 마이그레이션', () => {
  it('재적용 시 멱등(0건)', async () => {
    const applied = await store.applyMigrations();
    expect(applied).toBe(0);
  });
});

describe('PgStore 원문 버전 관리', () => {
  it('동일 콘텐츠 재수집 → 중복 버전 없음 + 경로/메뉴 보완', async () => {
    const a = await store.upsertSourcePage({
      url: 'https://x/fus/pg-a', seedName: null, kind: 'guide', title: 'A',
      contentSha256: 'sha-pg-1', collectedAt: '2026-08-25T00:00:00Z'
    });
    const b = await store.upsertSourcePage({
      url: 'https://x/fus/pg-a', seedName: null, kind: 'guide', title: 'A',
      contentSha256: 'sha-pg-1', rawHtmlPath: '/tmp/a.html', menuPath: ['FAQ'],
      collectedAt: '2026-08-26T00:00:00Z'
    });
    expect(b.changed).toBe(false);
    expect(b.versionId).toBe(a.versionId);
    const src = await store.getSource('https://x/fus/pg-a');
    expect(src?.versions).toHaveLength(1);
    expect(src?.versions[0]?.rawHtmlPath).toBe('/tmp/a.html');
    expect(src?.versions[0]?.menuPath).toEqual(['FAQ']);
  });

  it('콘텐츠 변경 → 새 버전 + 구버전 보존', async () => {
    await store.upsertSourcePage({ url: 'https://x/fus/pg-b', seedName: null, kind: 'guide', title: '구', contentSha256: 'old', collectedAt: '2026-01-01T00:00:00Z' });
    const up = await store.upsertSourcePage({ url: 'https://x/fus/pg-b', seedName: null, kind: 'guide', title: '신', contentSha256: 'new', collectedAt: '2026-02-01T00:00:00Z' });
    expect(up.changed).toBe(true);
    expect(up.versionIndex).toBe(2);
    const src = await store.getSource(up.sourceId);
    expect(src?.versions.map((v) => v.contentSha256)).toEqual(['old', 'new']);
  });

  it('currentVersions는 소스별 최신만 반환', async () => {
    const versions = await store.currentVersions();
    const pgB = versions.filter((v) => v.url === 'https://x/fus/pg-b');
    expect(pgB).toHaveLength(1);
    expect(pgB[0]!.contentSha256).toBe('new');
  });
});

describe('PgStore 규칙 플로우', () => {
  it('REVIEWER와 다른 ADMIN만 reviewed 규칙을 activate할 수 있음', async () => {
    const reviewer = await store.createUser(user('reviewer-rule', 'REVIEWER'));
    const admin = await store.createUser(user('admin-rule', 'ADMIN'));
    await store.upsertRule(baseRule('pg.strict', 1, 'draft'));

    expect((await store.approveRuleReview('pg.strict', 1, reviewer.id, '원문 확인', true)).ok).toBe(true);
    expect(await store.activateReviewedRule('pg.strict', 1, reviewer.id, '2026-08-30'))
      .toEqual({ ok: false, code: 'ROLE_REQUIRED' });
    expect((await store.activateReviewedRule('pg.strict', 1, admin.id, '2026-08-30')).ok).toBe(true);
    expect((await store.listRuleReviews('pg.strict', 1)).map((review) => review.action))
      .toEqual(['approve', 'activate']);
    expect(await store.listAudit()).toEqual(expect.arrayContaining([
      expect.objectContaining({ actorUserId: reviewer.id, action: 'rule.review.approve', targetId: 'pg.strict@1' }),
      expect.objectContaining({ actorUserId: admin.id, action: 'rule.review.activate', targetId: 'pg.strict@1' })
    ]));

    await store.upsertRule(baseRule('pg.strict', 1, 'draft', '수의계약'));
    expect((await store.listRules()).find((rule) => rule.id === 'pg.strict')
      ).toMatchObject({ status: 'active', output: { method: '입찰' } });
  });

  it('hold는 rule_version을 삭제하지 않고 검토기록을 남김', async () => {
    const reviewer = await store.createUser(user('reviewer-hold', 'REVIEWER'));
    await store.upsertRule(baseRule('pg.hold', 1, 'draft'));

    await store.holdRule('pg.hold', 1, reviewer.id, '추가 확인');

    expect((await store.listRules()).some((r) => r.id === 'pg.hold')).toBe(true);
    expect((await store.listRuleReviews('pg.hold', 1))[0]?.action).toBe('hold');
  });

  it('upsert는 active 상태를 직접 주입하지 않음', async () => {
    await store.upsertRule(baseRule('pg.injected', 1, 'active'));
    expect((await store.listRules()).find((r) => r.id === 'pg.injected')?.status).toBe('draft');
  });

  it('successful draft upsert refreshes the parent rule scope', async () => {
    await store.upsertRule(baseRule('pg.scope', 1, 'draft'));
    await store.upsertRule({ ...baseRule('pg.scope', 1, 'draft'), scope: { organization_type: 'school' } });

    const parent = await poolForTest().query('SELECT scope, current_status FROM rules WHERE id=$1', ['pg.scope']) as {
      rows: Array<{ scope: Record<string, string>; current_status: string }>;
    };
    expect(parent.rows[0]).toEqual({ scope: { organization_type: 'school' }, current_status: 'draft' });
  });

  it('final revision은 REVIEWER가 정확한 다음 버전만 생성할 수 있음', async () => {
    const reviewer = await store.createUser(user('reviewer-revision', 'REVIEWER'));

    expect(await store.createRuleRevision(baseRule('pg.revision', 1, 'draft'), reviewer.id))
      .toMatchObject({ ok: true, rule: { version: 1, status: 'draft' } });
    expect(await store.createRuleRevision(baseRule('pg.revision', 3, 'draft'), reviewer.id))
      .toEqual({ ok: false, code: 'VERSION_CONFLICT' });
    expect((await store.createRuleRevision(baseRule('pg.revision', 2, 'draft'), reviewer.id)).ok).toBe(true);
    expect(await store.createRuleRevision(baseRule('pg.revision', 2, 'draft'), reviewer.id))
      .toEqual({ ok: false, code: 'VERSION_CONFLICT' });
  });

  it('final activation은 같은 규칙의 prior active만 supersede함', async () => {
    const reviewer = await store.createUser(user('reviewer-supersede', 'REVIEWER'));
    const admin = await store.createUser(user('admin-supersede', 'ADMIN'));
    await store.createRuleRevision(baseRule('pg.supersede', 1, 'draft'), reviewer.id);
    await store.approveRuleReview('pg.supersede', 1, reviewer.id, 'v1 원문 확인', true);
    expect((await store.activateReviewedRule('pg.supersede', 1, admin.id, '2026-08-30')).ok).toBe(true);
    await store.createRuleRevision(baseRule('pg.supersede', 2, 'draft'), reviewer.id);
    await store.approveRuleReview('pg.supersede', 2, reviewer.id, 'v2 원문 확인', true);

    expect((await store.activateReviewedRule('pg.supersede', 2, admin.id, '2026-08-30')).ok).toBe(true);
    expect(Object.fromEntries(
      (await store.listRules()).filter((rule) => rule.id === 'pg.supersede').map((rule) => [rule.version, rule.status])
    )).toEqual({ 1: 'superseded', 2: 'active' });
  });

  it('final activation conflict rolls back without partial activation state', async () => {
    const reviewer = await store.createUser(user('reviewer-conflict', 'REVIEWER'));
    const admin = await store.createUser(user('admin-conflict', 'ADMIN'));
    await store.createRuleRevision(baseRule('pg.conflict.baseline', 1, 'draft'), reviewer.id);
    await store.approveRuleReview('pg.conflict.baseline', 1, reviewer.id, '기준 원문 확인', true);
    expect((await store.activateReviewedRule('pg.conflict.baseline', 1, admin.id, '2026-08-30')).ok).toBe(true);
    await store.createRuleRevision(baseRule('pg.conflict', 1, 'draft', '수의계약'), reviewer.id);
    await store.approveRuleReview('pg.conflict', 1, reviewer.id, '원문 확인', true);

    expect(await store.activateReviewedRule('pg.conflict', 1, admin.id, '2026-08-30'))
      .toEqual({ ok: false, code: 'RULE_CONFLICT' });
    expect((await store.listRules()).find((rule) => rule.id === 'pg.conflict')?.status).toBe('reviewed');
    expect((await store.listRuleReviews('pg.conflict', 1)).map((review) => review.action)).toEqual(['approve']);
    expect((await store.listAudit()).some((entry) =>
      entry.action === 'rule.review.activate' && entry.targetId === 'pg.conflict@1'
    )).toBe(false);
  });

  it('activation rolls back completed supersession when target activation write throws', async () => {
    const reviewer = await store.createUser(user('reviewer-rollback', 'REVIEWER'));
    const admin = await store.createUser(user('admin-rollback', 'ADMIN'));
    await store.createRuleRevision(baseRule('pg.rollback', 1, 'draft'), reviewer.id);
    await store.approveRuleReview('pg.rollback', 1, reviewer.id, 'v1 원문 확인', true);
    expect((await store.activateReviewedRule('pg.rollback', 1, admin.id, '2026-08-30')).ok).toBe(true);
    await store.createRuleRevision(baseRule('pg.rollback', 2, 'draft'), reviewer.id);
    await store.approveRuleReview('pg.rollback', 2, reviewer.id, 'v2 원문 확인', true);

    const pool = poolForTest();
    await pool.query(`CREATE OR REPLACE FUNCTION pg_test_fail_after_target_activation() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'forced activation rollback'; END;
      $$ LANGUAGE plpgsql`);
    await pool.query(`CREATE TRIGGER pg_test_fail_after_target_activation
      AFTER UPDATE OF status ON rule_versions
      FOR EACH ROW WHEN (NEW.rule_id = 'pg.rollback' AND NEW.version = 2 AND NEW.status = 'active')
      EXECUTE FUNCTION pg_test_fail_after_target_activation()`);
    try {
      await expect(store.activateReviewedRule('pg.rollback', 2, admin.id, '2026-08-30'))
        .rejects.toThrow('forced activation rollback');
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS pg_test_fail_after_target_activation ON rule_versions');
      await pool.query('DROP FUNCTION IF EXISTS pg_test_fail_after_target_activation()');
    }

    expect(Object.fromEntries(
      (await store.listRules()).filter((rule) => rule.id === 'pg.rollback').map((rule) => [rule.version, rule.status])
    )).toEqual({ 1: 'active', 2: 'reviewed' });
    expect((await store.listRuleReviews('pg.rollback', 1)).map((review) => review.action)).toEqual(['approve', 'activate']);
    expect((await store.listRuleReviews('pg.rollback', 2)).map((review) => review.action)).toEqual(['approve']);
    expect((await store.listAudit()).some((entry) =>
      entry.action === 'rule.review.activate' && entry.targetId === 'pg.rollback@2'
    )).toBe(false);
  });

  it('conditional upsert cannot demote a version activated after its stale read', async () => {
    const reviewer = await store.createUser(user('reviewer-race', 'REVIEWER'));
    const admin = await store.createUser(user('admin-race', 'ADMIN'));
    await store.upsertRule(baseRule('pg.race', 1, 'draft'));

    const pool = poolForTest();
    const originalQuery = pool.query;
    let releaseRead!: () => void;
    let releaseWrite!: () => void;
    const readReached = new Promise<void>((resolve) => { releaseRead = resolve; });
    const allowWrite = new Promise<void>((resolve) => { releaseWrite = resolve; });
    let paused = false;
    pool.query = async (text, values) => {
      const result = await originalQuery.call(pool, text, values);
      if (!paused && text === 'SELECT definition, status FROM rule_versions WHERE rule_id=$1 AND version=$2' && values?.[0] === 'pg.race') {
        paused = true;
        releaseRead();
        await allowWrite;
      }
      return result;
    };

    try {
      const staleUpsert = store.upsertRule(baseRule('pg.race', 1, 'draft', '수의계약'));
      await readReached;
      expect((await store.approveRuleReview('pg.race', 1, reviewer.id, '원문 확인', true)).ok).toBe(true);
      expect((await store.activateReviewedRule('pg.race', 1, admin.id, '2026-08-30')).ok).toBe(true);
      releaseWrite();
      await staleUpsert;
    } finally {
      pool.query = originalQuery;
    }

    const current = await originalQuery.call(pool, 'SELECT current_status FROM rules WHERE id=$1', ['pg.race']) as {
      rows: Array<{ current_status: string }>;
    };
    expect(current.rows[0]?.current_status).toBe('active');
    expect((await store.listRules()).find((rule) => rule.id === 'pg.race')
      ).toMatchObject({ status: 'active', output: { method: '입찰' } });
  });

  it('draft→activate 불가 / review 후 activate 가능 / 신규 active 시 구버전 superseded', async () => {
    await store.upsertRule(baseRule('pg.rule', 1, 'draft'));
    expect(await store.activateRule('pg.rule', 1, 'admin')).toBeNull();
    expect((await store.reviewRule('pg.rule', 1, 'reviewed'))?.status).toBe('reviewed');
    expect((await store.activateRule('pg.rule', 1, 'admin'))?.status).toBe('active');

    // 재upsert(draft)해도 active 상태 유지(D-011 에스컬레이션 가드)
    await store.upsertRule(baseRule('pg.rule', 1, 'draft'));
    expect((await store.getActiveRules()).some((r) => r.id === 'pg.rule')).toBe(true);

    await store.upsertRule(baseRule('pg.rule', 2, 'draft'));
    await store.reviewRule('pg.rule', 2, 'reviewed');
    await store.activateRule('pg.rule', 2, 'admin');
    const statuses = Object.fromEntries(
      (await store.listRules()).filter((r) => r.id === 'pg.rule').map((r) => [r.version, r.status])
    );
    expect(statuses[1]).toBe('superseded');
    expect(statuses[2]).toBe('active');
  });

  it('purgeStaleCandidateDrafts는 candidate draft만 제거', async () => {
    await store.upsertRule(baseRule('candidate.amount.x', 1, 'draft'));
    await store.upsertRule(baseRule('candidate.ratio.y', 1, 'draft'));
    await store.reviewRule('candidate.ratio.y', 1, 'reviewed');
    const removed = await store.purgeStaleCandidateDrafts(['candidate.ratio.candidate.ratio.y'.slice(0, 10) + 'y@1']);
    void removed;
    const ids = (await store.listRules()).map((r) => `${r.id}@${r.version}`);
    expect(ids).toContain('candidate.ratio.y@1'); // reviewed는 보존
    expect(ids).not.toContain('candidate.amount.x@1');
  });
});

describe('PgStore 사용자·세션·프로젝트', () => {
  it('scrypt 해시 검증 및 RBAC 접근제어', async () => {
    const { hashPassword, verifyPassword } = await import('@sen/db');
    const owner = await store.createUser({ username: 'pgu1', passwordHash: hashPassword('pw'), displayName: 'U1', role: 'USER' });
    const admin = await store.createUser({ username: 'pga1', passwordHash: hashPassword('pw'), displayName: 'A1', role: 'ADMIN' });
    expect(verifyPassword('pw', owner.passwordHash)).toBe(true);

    const p = await store.createProject({
      ownerId: owner.id, name: 'PG 프로젝트', contractCategory: 'construction',
      estimatedPrice: 1000, organizationType: 'school', status: 'planning', wizardInput: null
    }, { plan: ['문서준비'] });
    expect(await store.canAccessProject(p.id, owner.id, 'USER')).toBe(true);
    expect(await store.canAccessProject(p.id, admin.id, 'ADMIN')).toBe(true);

    const item = (await store.checklistOf(p.id))[0]!;
    await store.toggleChecklist(item.id, true);
    expect((await store.stepsOf(p.id))[0]!.status).toBe('done');
  });

  it('세션 생성/조회/만료/삭제', async () => {
    const u = await store.createUser({ username: 'pgs1', passwordHash: 's:h', displayName: 'S', role: 'USER' });
    const token = 'tok-' + Date.now();
    await store.createSession(token, u.id, 'csrf-1', 60_000);
    expect((await store.getSession(token))?.csrfToken).toBe('csrf-1');
    await store.deleteSession(token);
    expect(await store.getSession(token)).toBeNull();
  });
});

describe('PgStore 프로젝트 생명주기', () => {
  it('PG 상태 전이와 변경행이 한 트랜잭션으로 저장', async () => {
    const owner = await store.createUser(user('pg-lifecycle-owner', 'USER'));
    const project = await store.createProject({
      ownerId: owner.id, name: 'PG 생명주기', contractCategory: 'construction',
      estimatedPrice: 1000, organizationType: 'school', status: 'planning', wizardInput: null
    }, {});

    const result = await store.transitionProjectStatus(project.id, 'contracting', owner.id, '계약 시작');

    expect(result).toMatchObject({ ok: true, project: { status: 'contracting' } });
    expect((await store.listProjectChanges(project.id))[0]).toMatchObject({
      changeType: 'status', before: { status: 'planning' }, after: { status: 'contracting' }, approvedBy: owner.id
    });
  });

  it('PG event due_at을 서울 날짜로 왕복', async () => {
    const owner = await store.createUser(user('pg-event-owner', 'USER'));
    const project = await store.createProject({
      ownerId: owner.id, name: 'PG 일정', contractCategory: 'construction',
      estimatedPrice: 1000, organizationType: 'school', status: 'planning', wizardInput: null
    }, {});

    await store.addProjectEvent(project.id, 'inspection', '검사', '2026-12-20', owner.id);

    expect((await store.listProjectEvents(project.id))[0]?.dueDate).toBe('2026-12-20');
  });
});

describe('팩토리 createStore', () => {
  it('DATABASE_URL 지정 시 PgStore 반환', async () => {
    const s = await createStore({ databaseUrl: url, appStoreDir: './data/app-store' });
    expect(s.constructor.name).toBe('PgStore');
    await (s as PgStore).close();
  });

  it('미지정 시 FileStore 반환', async () => {
    const s = await createStore({ databaseUrl: null, appStoreDir: './data/app-store' });
    expect(s.constructor.name).toBe('FileStore');
  });
});
