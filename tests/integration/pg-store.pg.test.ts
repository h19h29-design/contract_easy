import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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

function documentInput(projectId: string, checklistItemId: string, sha256: string) {
  return {
    projectId,
    checklistItemId,
    uploadedBy: 'evidence-uploader',
    originalName: '검사조서.pdf',
    storedPath: '/private/evidence/검사조서.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1234,
    sha256
  };
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
  it('직접 호출한 malformed review와 hold 증거를 예외 없이 거부한다', async () => {
    const reviewer = await store.createUser(user('reviewer-malformed', 'REVIEWER'));
    await store.upsertRule(baseRule('pg.malformed-review', 1, 'draft'));
    await store.upsertRule(baseRule('pg.malformed-hold', 1, 'draft'));

    await expect(store.approveRuleReview('pg.malformed-review', 1, reviewer.id, '원문 확인', 'yes' as unknown as boolean))
      .resolves.toEqual({ ok: false, code: 'SOURCE_CONFIRMATION_REQUIRED' });
    await expect(store.holdRule('pg.malformed-hold', 1, reviewer.id, null as unknown as string))
      .resolves.toEqual({ ok: false, code: 'SOURCE_CONFIRMATION_REQUIRED' });
  });

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
    const reviewer = await store.createUser(user('reviewer-legacy-flow', 'REVIEWER'));
    const admin = await store.createUser(user('admin-legacy-flow', 'ADMIN'));
    await store.upsertRule(baseRule('pg.rule', 1, 'draft'));
    expect(await store.activateReviewedRule('pg.rule', 1, admin.id, '2026-08-30')).toEqual({ ok: false, code: 'INVALID_STATE' });
    expect(await store.approveRuleReview('pg.rule', 1, reviewer.id, '원문 확인', true))
      .toMatchObject({ ok: true, rule: { status: 'reviewed' } });
    expect(await store.activateReviewedRule('pg.rule', 1, admin.id, '2026-08-30'))
      .toMatchObject({ ok: true, rule: { status: 'active' } });

    // 재upsert(draft)해도 active 상태 유지(D-011 에스컬레이션 가드)
    await store.upsertRule(baseRule('pg.rule', 1, 'draft'));
    expect((await store.getActiveRules()).some((r) => r.id === 'pg.rule')).toBe(true);

    await store.upsertRule(baseRule('pg.rule', 2, 'draft'));
    await store.approveRuleReview('pg.rule', 2, reviewer.id, '원문 확인', true);
    await store.activateReviewedRule('pg.rule', 2, admin.id, '2026-08-30');
    const statuses = Object.fromEntries(
      (await store.listRules()).filter((r) => r.id === 'pg.rule').map((r) => [r.version, r.status])
    );
    expect(statuses[1]).toBe('superseded');
    expect(statuses[2]).toBe('active');
  });

  it('purgeStaleCandidateDrafts는 candidate draft만 제거', async () => {
    const reviewer = await store.createUser(user('reviewer-purge', 'REVIEWER'));
    await store.upsertRule(baseRule('candidate.amount.x', 1, 'draft'));
    await store.upsertRule(baseRule('candidate.ratio.y', 1, 'draft'));
    await store.approveRuleReview('candidate.ratio.y', 1, reviewer.id, '원문 확인', true);
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

describe('PgStore 체크리스트 증빙 메타데이터', () => {
  it('증빙 교체가 이전 document를 보존', async () => {
    const owner = await store.createUser(user('pg-evidence-owner', 'USER'));
    const project = await store.createProject({
      ownerId: owner.id, name: 'PG 증빙 교체', contractCategory: 'construction',
      estimatedPrice: 1000, organizationType: 'school', status: 'planning', wizardInput: null
    }, { plan: ['증빙 제출'] });
    const item = (await store.checklistOf(project.id))[0]!;

    const first = await store.saveChecklistEvidence(documentInput(project.id, item.id, 'a'.repeat(64)));
    const second = await store.saveChecklistEvidence(documentInput(project.id, item.id, 'b'.repeat(64)));

    expect(second?.previousDocumentId).toBe(first?.document.id);
    expect(await store.listProjectDocuments(project.id)).toHaveLength(2);
    expect((await store.checklistOf(project.id))[0]?.evidencePath).toBe(second?.document.id);
    expect((await store.listAudit()).find((entry) => entry.targetId === second?.document.id)).toMatchObject({
      action: 'checklist.evidence.save',
      detail: {
        checklistItemId: item.id,
        previousDocumentId: first?.document.id,
        newDocumentId: second?.document.id,
        sha256: 'b'.repeat(64)
      }
    });
    expect((await store.listAudit()).find((entry) => entry.targetId === second?.document.id)?.detail)
      .not.toHaveProperty('storedPath');
  });

  it('다른 프로젝트 item에 document를 연결하지 않음', async () => {
    const owner = await store.createUser(user('pg-evidence-cross-owner', 'USER'));
    const projectA = await store.createProject({
      ownerId: owner.id, name: 'PG 프로젝트 A', contractCategory: 'construction',
      estimatedPrice: 1000, organizationType: 'school', status: 'planning', wizardInput: null
    }, { plan: ['증빙 A'] });
    const projectB = await store.createProject({
      ownerId: owner.id, name: 'PG 프로젝트 B', contractCategory: 'construction',
      estimatedPrice: 1000, organizationType: 'school', status: 'planning', wizardInput: null
    }, { plan: ['증빙 B'] });
    const itemB = (await store.checklistOf(projectB.id))[0]!;

    expect(await store.saveChecklistEvidence(documentInput(projectA.id, itemB.id, 'c'.repeat(64)))).toBeNull();
    expect((await store.checklistOf(projectB.id))[0]?.evidencePath).toBeNull();
    expect(await store.listProjectDocuments(projectA.id)).toEqual([]);
  });

  it('동일 시각에 같은 SHA 증빙을 교체해도 문서 ID를 중복하지 않음', async () => {
    const owner = await store.createUser(user('pg-evidence-same-sha', 'USER'));
    const project = await store.createProject({
      ownerId: owner.id, name: 'PG 동일 SHA 증빙', contractCategory: 'construction',
      estimatedPrice: 1000, organizationType: 'school', status: 'planning', wizardInput: null
    }, { plan: ['증빙 제출'] });
    const item = (await store.checklistOf(project.id))[0]!;
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-08-30T00:00:00.000Z'));
      const first = (await store.saveChecklistEvidence(documentInput(project.id, item.id, 'd'.repeat(64))))!;
      const second = (await store.saveChecklistEvidence(documentInput(project.id, item.id, 'd'.repeat(64))))!;

      expect(second.document.id).not.toBe(first.document.id);
      expect(second.previousDocumentId).toBe(first.document.id);
      const documents = await store.listProjectDocuments(project.id);
      expect(documents).toHaveLength(2);
      expect(documents.map((document) => document.id)).toEqual(expect.arrayContaining([
        first.document.id, second.document.id
      ]));
      expect((await store.checklistOf(project.id))[0]?.evidencePath).toBe(second.document.id);
    } finally {
      vi.useRealTimers();
    }
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
    expect((await store.listAudit()).filter((entry) =>
      entry.action === 'project.status.transition' && entry.targetId === project.id
    )).toEqual([
      expect.objectContaining({
        actorUserId: owner.id, action: 'project.status.transition', targetType: 'project', targetId: project.id,
        detail: expect.objectContaining({ previousStatus: 'planning', nextStatus: 'contracting', reason: '계약 시작' })
      })
    ]);
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

  it('잘못된 상태 전이는 프로젝트·변경·감사 기록을 만들지 않는다', async () => {
    const owner = await store.createUser(user('pg-invalid-transition-owner', 'USER'));
    const project = await store.createProject({
      ownerId: owner.id, name: '잘못된 상태 전이', contractCategory: 'construction',
      estimatedPrice: 1000, organizationType: 'school', status: 'planning', wizardInput: null
    }, {});

    expect(await store.transitionProjectStatus(project.id, 'working', owner.id, '건너뜀'))
      .toEqual({ ok: false, code: 'INVALID_TRANSITION' });
    expect((await store.getProject(project.id))?.status).toBe('planning');
    expect(await store.listProjectChanges(project.id)).toEqual([]);
    expect((await store.listAudit()).filter((entry) => entry.targetId === project.id)).toEqual([]);
  });

  it('상태 변경 뒤 변경행 쓰기가 실패하면 프로젝트·변경·감사를 모두 롤백한다', async () => {
    const owner = await store.createUser(user('pg-transition-rollback-owner', 'USER'));
    const project = await store.createProject({
      ownerId: owner.id, name: '상태 전이 롤백', contractCategory: 'construction',
      estimatedPrice: 1000, organizationType: 'school', status: 'planning', wizardInput: null
    }, {});
    const pool = poolForTest();
    await pool.query(`CREATE OR REPLACE FUNCTION pg_test_fail_project_transition() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'forced project transition rollback'; END;
      $$ LANGUAGE plpgsql`);
    await pool.query(`CREATE TRIGGER pg_test_fail_project_transition
      BEFORE INSERT ON project_changes
      FOR EACH ROW WHEN (NEW.project_id = '${project.id}')
      EXECUTE FUNCTION pg_test_fail_project_transition()`);
    try {
      await expect(store.transitionProjectStatus(project.id, 'contracting', owner.id, '계약 시작'))
        .rejects.toThrow('forced project transition rollback');
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS pg_test_fail_project_transition ON project_changes');
      await pool.query('DROP FUNCTION IF EXISTS pg_test_fail_project_transition()');
    }

    expect((await store.getProject(project.id))?.status).toBe('planning');
    expect(await store.listProjectChanges(project.id)).toEqual([]);
    expect((await store.listAudit()).filter((entry) => entry.targetId === project.id)).toEqual([]);
  });

  it('감사행 쓰기가 실패하면 앞선 상태와 변경행도 모두 롤백한다', async () => {
    const owner = await store.createUser(user('pg-audit-rollback-owner', 'USER'));
    const project = await store.createProject({
      ownerId: owner.id, name: '감사 전이 롤백', contractCategory: 'construction',
      estimatedPrice: 1000, organizationType: 'school', status: 'planning', wizardInput: null
    }, {});
    const pool = poolForTest();
    await pool.query(`CREATE OR REPLACE FUNCTION pg_test_fail_project_transition_audit() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'forced project transition audit rollback'; END;
      $$ LANGUAGE plpgsql`);
    await pool.query(`CREATE TRIGGER pg_test_fail_project_transition_audit
      BEFORE INSERT ON audit_logs
      FOR EACH ROW WHEN (NEW.target_id = '${project.id}' AND NEW.action = 'project.status.transition')
      EXECUTE FUNCTION pg_test_fail_project_transition_audit()`);
    try {
      await expect(store.transitionProjectStatus(project.id, 'contracting', owner.id, '감사 실패'))
        .rejects.toThrow('forced project transition audit rollback');
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS pg_test_fail_project_transition_audit ON audit_logs');
      await pool.query('DROP FUNCTION IF EXISTS pg_test_fail_project_transition_audit()');
    }

    expect((await store.getProject(project.id))?.status).toBe('planning');
    expect(await store.listProjectChanges(project.id)).toEqual([]);
    expect((await store.listAudit()).filter((entry) => entry.targetId === project.id)).toEqual([]);
  });

  it('일반 프로젝트 수정은 상태를 보호하고 undefined wizardInput을 보존한다', async () => {
    const owner = await store.createUser(user('pg-update-status-owner', 'USER'));
    const project = await store.createProject({
      ownerId: owner.id, name: '상태 보호', contractCategory: 'construction',
      estimatedPrice: 1000, organizationType: 'school', status: 'planning',
      wizardInput: {
        projectName: '원본', workType: '건축', contractCategory: 'construction', estimatedPrice: 1000,
        governmentMaterials: false, constructionWaste: false, emergency: false, regionRestriction: false,
        performanceRestriction: false, organizationType: 'school'
      }
    }, {});

    const updated = await store.updateProject(project.id, {
      name: '이름만 변경', status: 'working', wizardInput: undefined
    });

    expect(updated).toMatchObject({
      name: '이름만 변경', status: 'planning', wizardInput: { workType: '건축' }
    });
    expect(await store.listProjectChanges(project.id)).toEqual([]);
  });

  it('동시 상태 전이 뒤 일반 수정은 읽은 이전 상태를 되돌리지 않는다', async () => {
    const owner = await store.createUser(user('pg-stale-update-owner', 'USER'));
    const project = await store.createProject({
      ownerId: owner.id, name: '경합 상태 보호', contractCategory: 'construction',
      estimatedPrice: 1000, organizationType: 'school', status: 'planning', wizardInput: null
    }, {});
    const pool = poolForTest();
    const originalQuery = pool.query;
    let releaseRead!: () => void;
    let releaseUpdate!: () => void;
    const readReached = new Promise<void>((resolve) => { releaseRead = resolve; });
    const allowUpdate = new Promise<void>((resolve) => { releaseUpdate = resolve; });
    let paused = false;
    pool.query = async (text, values) => {
      const result = await originalQuery.call(pool, text, values);
      if (!paused && text === 'SELECT * FROM contract_projects WHERE id=$1' && values?.[0] === project.id) {
        paused = true;
        releaseRead();
        await allowUpdate;
      }
      return result;
    };
    try {
      const staleUpdate = store.updateProject(project.id, { name: '뒤늦은 이름 수정' });
      await readReached;
      expect((await store.transitionProjectStatus(project.id, 'contracting', owner.id, '계약 시작')).ok).toBe(true);
      releaseUpdate();
      await staleUpdate;
    } finally {
      pool.query = originalQuery;
    }

    expect((await store.getProject(project.id))?.status).toBe('contracting');
    expect((await store.listProjectChanges(project.id))[0]).toMatchObject({ changeType: 'status' });
  });

  it('일반 변경과 이벤트는 append-only로 최신순이며 프로젝트 필드를 수정하지 않는다', async () => {
    const owner = await store.createUser(user('pg-append-owner', 'USER'));
    const project = await store.createProject({
      ownerId: owner.id, name: '추가 전용 이력', contractCategory: 'construction',
      estimatedPrice: 1000, organizationType: 'school', status: 'planning', wizardInput: null
    }, {});
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      const firstChange = await store.addProjectChange(project.id, 'amount', { amount: 1000 }, { amount: 1100 }, '첫 금액 변경', owner.id);
      const firstEvent = await store.addProjectEvent(project.id, 'inspection', '1차 검사', '2026-12-20', owner.id);
      vi.setSystemTime(new Date('2026-01-02T00:00:00.000Z'));
      const secondChange = await store.addProjectChange(project.id, 'duration', { days: 10 }, { days: 11 }, '기간 변경', owner.id);
      const secondEvent = await store.addProjectEvent(project.id, 'inspection', '2차 검사', '2026-12-21', owner.id);

      expect(await store.listProjectChanges(project.id)).toMatchObject([
        { id: secondChange?.id, changeType: 'duration' }, { id: firstChange?.id, changeType: 'amount' }
      ]);
      expect(await store.listProjectEvents(project.id)).toMatchObject([
        { id: secondEvent?.id, dueDate: '2026-12-21' }, { id: firstEvent?.id, dueDate: '2026-12-20' }
      ]);
      expect(await store.getProject(project.id)).toMatchObject({ estimatedPrice: 1000, status: 'planning' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('유효하지 않은 이벤트 날짜는 이벤트나 감사를 만들지 않는다', async () => {
    const owner = await store.createUser(user('pg-invalid-date-owner', 'USER'));
    const project = await store.createProject({
      ownerId: owner.id, name: '날짜 검증', contractCategory: 'construction',
      estimatedPrice: 1000, organizationType: 'school', status: 'planning', wizardInput: null
    }, {});

    expect(await store.addProjectEvent(project.id, 'inspection', '잘못된 날짜', '2026-02-30', owner.id)).toBeNull();
    expect(await store.addProjectEvent(project.id, 'inspection', '접미사 날짜', '2026-02-28extra', owner.id)).toBeNull();
    expect(await store.listProjectEvents(project.id)).toEqual([]);
    expect((await store.listAudit()).filter((entry) => entry.targetId === project.id)).toEqual([]);
  });

  it('변경 이력 JSON과 이벤트 반환값은 호출자 변경으로 오염되지 않는다', async () => {
    const owner = await store.createUser(user('pg-json-isolation-owner', 'USER'));
    const project = await store.createProject({
      ownerId: owner.id, name: '이력 격리', contractCategory: 'construction',
      estimatedPrice: 1000, organizationType: 'school', status: 'planning', wizardInput: null
    }, {});
    const before: Record<string, unknown> = { amount: { value: 1000 } };
    const after: Record<string, unknown> = { amount: { value: 1100 } };
    const change = await store.addProjectChange(project.id, 'amount', before, after, '금액 변경', owner.id);
    const event = await store.addProjectEvent(project.id, 'inspection', '준공검사 예정', '2026-12-20', owner.id);

    (before.amount as { value: number }).value = 9999;
    (after.amount as { value: number }).value = 9999;
    (change!.before!.amount as { value: number }).value = 8888;
    change!.reason = '변조';
    event!.title = '변조';
    const listedChange = (await store.listProjectChanges(project.id))[0]!;
    const listedEvent = (await store.listProjectEvents(project.id))[0]!;
    (listedChange.after!.amount as { value: number }).value = 7777;
    listedChange.reason = '변조';
    listedEvent.title = '변조';

    expect((await store.listProjectChanges(project.id))[0]).toMatchObject({
      before: { amount: { value: 1000 } }, after: { amount: { value: 1100 } }, reason: '금액 변경'
    });
    expect((await store.listProjectEvents(project.id))[0]).toMatchObject({ title: '준공검사 예정' });
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
