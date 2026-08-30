import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from './server.js';
import { FileStore } from '@sen/db';
import { getConfig } from '@sen/config';
import { HybridRetriever } from '@sen/retrieval';
import type { Chunk, RuleDefinition } from '@sen/shared';

let app: Awaited<ReturnType<typeof buildApp>>['app'];
let tmpDir: string;
let store: FileStore;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-api-'));
  store = new FileStore(tmpDir);
  const chunk = (id: string, text: string): Chunk => ({
    id, sourceVersionId: 'sv1', url: 'https://contract.sen.go.kr/fus/test',
    docTitle: '테스트 문서', sectionPath: [], order: 0, type: 'paragraph',
    text,
    meta: {}
  });
  store.replaceChunks([chunk('c1', '전자입찰은 나라장터를 통해 실시한다.'), chunk('c2', '계약보증금은 계약금액에 따라 정한다.')]);
  const retriever = new HybridRetriever({ chunks: store.getChunks(), versions: [] });
  ({ app } = await buildApp({ store, retriever }));
});

afterAll(async () => {
  app.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('공개 API', () => {
  it('health 응답', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });

  it('키워드 검색(API 키 없이) 동작', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/search?q=나라장터' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.count).toBeGreaterThan(0);
    expect(body.hits[0].url).toContain('contract.sen.go.kr');
  });

  it('근거 없는 질문 → 답변 거부', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/ask', payload: { question: 'zzz 완전 무관 qqq' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().answered).toBe(false);
  });

  it('활성 규칙 없음 → 마법사 REVIEW_REQUIRED', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/wizard',
      payload: wizardInput()
    });
    const body = res.json();
    expect(body.decisionState).toBe('REVIEW_REQUIRED');
    expect(body.recommendedMethod).toBeUndefined();
  });

  it('계약예정일 이후 시행 active 규칙은 마법사에서 거부', async () => {
    store.upsertRule(futureRule());
    const res = await app.inject({
      method: 'POST', url: '/api/wizard',
      payload: { ...wizardInput(), contractPlannedDate: '2026-12-31' }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().decisionState).toBe('REVIEW_REQUIRED');
    expect(res.json().recommendedMethod).toBeUndefined();
  });

  it('검색어 없으면 400', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/search?q=' });
    expect(res.statusCode).toBe(400);
  });
});

describe('인증·프로젝트 흐름', () => {
  let csrfToken = '';
  let cookie = '';

  it('로그인 → 세션 쿠키 + CSRF 토큰', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'ChangeMe!2026' } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.role).toBe('ADMIN');
    csrfToken = body.csrfToken;
    cookie = res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  });

  it('잘못된 비밀번호 → 401 + 감사로그', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'wrong' } });
    expect(res.statusCode).toBe(401);
  });

  it('비로그인 프로젝트 생성 → 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'x', contractCategory: 'construction', organizationType: 'school' } });
    expect(res.statusCode).toBe(401);
  });

  it('프로젝트 생성 → 단계/체크리스트 자동 구성 → 체크 변경', async () => {
    const create = await app.inject({
      method: 'POST', url: '/api/projects',
      cookies: { scg_session: extractSession(cookie) },
      headers: { 'x-csrf-token': csrfToken },
      payload: { name: '테스트 공사', contractCategory: 'construction', estimatedPrice: 300000000, organizationType: 'school' }
    });
    expect(create.statusCode).toBe(200);
    const projectId = create.json().id;

    const detail = await app.inject({
      method: 'GET', url: `/api/projects/${projectId}`,
      cookies: { scg_session: extractSession(cookie) }
    });
    expect(detail.statusCode).toBe(200);
    const body = detail.json();
    expect(body.steps).toHaveLength(10);
    expect(body.checklist.length).toBeGreaterThanOrEqual(30);

    const toggle = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}/checklist/${body.checklist[0].id}`,
      cookies: { scg_session: extractSession(cookie) },
      headers: { 'x-csrf-token': csrfToken },
      payload: { done: true }
    });
    expect(toggle.statusCode).toBe(200);
    expect(toggle.json().done).toBe(true);

    // CSRF 누락 → 403
    const noCsrf = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}/checklist/${body.checklist[1]!.id}`,
      cookies: { scg_session: extractSession(cookie) },
      payload: { done: true }
    });
    expect(noCsrf.statusCode).toBe(403);
  });

  it('관리자 규칙 활성화 플로우(draft→reviewed→active)', async () => {
    const store = (app as unknown as { __store?: FileStore }).__store;
    void store;
    // draft 규칙 주입
    const rulesRes = await app.inject({ method: 'GET', url: '/api/admin/rules', cookies: { scg_session: extractSession(cookie) } });
    expect(rulesRes.statusCode).toBe(200);
  });
});

describe('규칙 관리자 API의 엄격한 승인 흐름', () => {
  it('REVIEWER review 후 같은 ID activation을 거부하고 다른 ADMIN은 성공', async () => {
    const fixture = await createRuleAdminFixture();
    try {
      const reviewed = await fixture.injectAs(fixture.reviewer, 'POST', '/api/admin/rules/strict/1', {
        action: 'review', comment: '원문과 경계 확인', sourceConfirmed: true
      });
      expect(reviewed.statusCode).toBe(200);

      const promotedStore = promoteToAdmin(fixture.dir, fixture.reviewer.id);
      const promotedApp = await buildApp({ store: promotedStore, retriever: fixture.retriever });
      try {
        expect((await injectAs(promotedApp.app, fixture.reviewer, 'POST', '/api/admin/rules/strict/1', {
          action: 'activate'
        })).statusCode).toBe(409);
        expect((await injectAs(promotedApp.app, fixture.admin2, 'POST', '/api/admin/rules/strict/1', {
          action: 'activate'
        })).statusCode).toBe(200);
      } finally {
        await promotedApp.app.close();
      }
    } finally {
      await fixture.close();
    }
  });

  it('sourceConfirmed 없는 review를 400으로 거부', async () => {
    const fixture = await createRuleAdminFixture();
    try {
      const res = await fixture.injectAs(fixture.reviewer, 'POST', '/api/admin/rules/strict/1', {
        action: 'review', comment: '확인'
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await fixture.close();
    }
  });

  it('malformed review와 hold 증거를 항상 400으로 거부한다', async () => {
    const malformedReviews: unknown[] = [
      { action: 'review', comment: '확인', sourceConfirmed: 1 },
      { action: 'review', comment: '확인', sourceConfirmed: 'yes' },
      { action: 'review', comment: '확인', sourceConfirmed: null },
      { action: 'review', comment: '확인', sourceConfirmed: [] },
      { action: 'review', comment: '확인', sourceConfirmed: {} },
      { action: 'review', comment: '확인' },
      { action: 'review', comment: null, sourceConfirmed: true },
      { action: 'review', comment: 1, sourceConfirmed: true },
      { action: 'review', comment: [], sourceConfirmed: true },
      { action: 'review', comment: {}, sourceConfirmed: true },
      { action: 'review', sourceConfirmed: true }
    ];
    const malformedHolds: unknown[] = [
      { action: 'hold', comment: null }, { action: 'hold', comment: 1 },
      { action: 'hold', comment: [] }, { action: 'hold', comment: {} }, { action: 'hold' }
    ];
    for (const payload of [...malformedReviews, ...malformedHolds]) {
      const fixture = await createRuleAdminFixture();
      try {
        const res = await fixture.injectAs(fixture.reviewer, 'POST', '/api/admin/rules/strict/1', payload);
        expect(res.statusCode).toBe(400);
      } finally {
        await fixture.close();
      }
    }
  });

  it('규칙 작업 본문이 없으면 400으로 거부', async () => {
    const fixture = await createRuleAdminFixture();
    try {
      const res = await fixture.injectAs(fixture.reviewer, 'POST', '/api/admin/rules/strict/1', undefined);
      expect(res.statusCode).toBe(400);
    } finally {
      await fixture.close();
    }
  });

  it('검토자는 통제된 method-band 개정만 다음 draft 버전으로 생성한다', async () => {
    const fixture = await createRuleAdminFixture();
    try {
      const res = await fixture.injectAs(fixture.reviewer, 'POST', '/api/admin/rules/strict/1/revisions', {
        method: '제한경쟁', lower: 100, lowerInclusive: false, upper: 200, upperInclusive: true,
        message: '금액 구간 재검토',
        source: { title: '개정 근거', url: 'https://example.org/revision', effectiveFrom: null, checkedAt: '2026-08-30' },
        conditions: [{ field: 'untrusted', operator: 'eq', value: true }]
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().rule).toMatchObject({
        id: 'strict', version: 2, status: 'draft', output: { method: '제한경쟁', message: '금액 구간 재검토' },
        conditions: [
          { field: 'estimated_price', operator: 'gt', value: 100 },
          { field: 'estimated_price', operator: 'lte', value: 200 }
        ]
      });
    } finally {
      await fixture.close();
    }
  });
});

describe('운영 기동 안전장치', () => {
  it('production 빈 저장소는 ADMIN_INITIAL_PASSWORD 없이는 기동을 거부한다', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalWebOrigin = process.env.WEB_ORIGIN;
    const originalInitialPassword = process.env.ADMIN_INITIAL_PASSWORD;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-api-production-'));
    try {
      process.env.NODE_ENV = 'production';
      process.env.WEB_ORIGIN = 'https://example.test';
      delete process.env.ADMIN_INITIAL_PASSWORD;
      await expect(buildApp({ store: new FileStore(dir) })).rejects.toThrow('ADMIN_INITIAL_PASSWORD 환경변수가 필요합니다.');
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
      if (originalWebOrigin === undefined) delete process.env.WEB_ORIGIN;
      else process.env.WEB_ORIGIN = originalWebOrigin;
      if (originalInitialPassword === undefined) delete process.env.ADMIN_INITIAL_PASSWORD;
      else process.env.ADMIN_INITIAL_PASSWORD = originalInitialPassword;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('production은 단일 HTTP(S) origin만 credentialed CORS에 허용한다', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalWebOrigin = process.env.WEB_ORIGIN;
    const originalInitialPassword = process.env.ADMIN_INITIAL_PASSWORD;
    const invalidOrigins = [
      '*', 'null', 'file:///tmp/app', 'https://user:pass@example.test',
      'https://*.example.test', 'https://%2A.example.test',
      'https://example.test/path', 'https://example.test?x=1', 'https://example.test#fragment'
    ];
    const tempDirs: string[] = [];
    const tempStore = () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-api-origin-'));
      tempDirs.push(dir);
      return new FileStore(dir);
    };
    try {
      process.env.NODE_ENV = 'production';
      process.env.ADMIN_INITIAL_PASSWORD = 'test-only-initial-password';
      for (const origin of invalidOrigins) {
        process.env.WEB_ORIGIN = origin;
        await expect(buildApp({ store: tempStore() }))
          .rejects.toThrow('WEB_ORIGIN');
      }

      process.env.WEB_ORIGIN = 'https://example.test/';
      expect(getConfig().webOrigin).toBe('https://example.test');
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
      if (originalWebOrigin === undefined) delete process.env.WEB_ORIGIN;
      else process.env.WEB_ORIGIN = originalWebOrigin;
      if (originalInitialPassword === undefined) delete process.env.ADMIN_INITIAL_PASSWORD;
      else process.env.ADMIN_INITIAL_PASSWORD = originalInitialPassword;
      for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

function wizardInput() {
  return {
    workType: '건축', contractCategory: 'construction', estimatedPrice: 500_000_000,
    governmentMaterials: false, constructionWaste: false, emergency: false,
    regionRestriction: false, performanceRestriction: false,
    contractPlannedDate: null, completionPlannedDate: null, organizationType: 'school'
  };
}

function extractSession(cookieHeader: string): string {
  return cookieHeader.split(';').find((c) => c.startsWith('scg_session='))!.split('=')[1]!;
}

function futureRule(): RuleDefinition {
  return {
    id: 'future.rule', version: 1, status: 'active',
    scope: { contract_category: 'construction' },
    conditions: [{ field: 'estimated_price', operator: 'between', value: [0, 0] }],
    output: { method: 'FUTURE_METHOD' },
    source: {
      title: '미래 시행 규칙', url: 'https://example.org/future-rule',
      effectiveFrom: '2027-01-01', checkedAt: '2026-08-25'
    },
    createdAt: '2026-08-25T00:00:00.000Z',
    updatedAt: '2026-08-25T00:00:00.000Z'
  };
}

type RuleAdminUser = { id: string; token: string; csrfToken: string };

async function createRuleAdminFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-api-rules-'));
  const store = new FileStore(dir);
  store.upsertRule(strictRule());
  const reviewer = await createRuleAdminUser(store, 'reviewer', 'REVIEWER');
  const admin2 = await createRuleAdminUser(store, 'admin2', 'ADMIN');
  const retriever = new HybridRetriever({ chunks: [], versions: [] });
  const built = await buildApp({ store, retriever });
  return {
    dir, reviewer, admin2, retriever,
    injectAs: (user: RuleAdminUser, method: 'POST', url: string, payload: unknown) => injectAs(built.app, user, method, url, payload),
    close: async () => {
      await built.app.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

async function createRuleAdminUser(store: FileStore, username: string, role: 'REVIEWER' | 'ADMIN'): Promise<RuleAdminUser> {
  const user = store.createUser({ username, passwordHash: 's:fixture', displayName: username, role });
  const token = `token-${username}`;
  const csrfToken = `csrf-${username}`;
  store.createSession(token, user.id, csrfToken, 60_000);
  return { id: user.id, token, csrfToken };
}

function injectAs(
  target: Awaited<ReturnType<typeof buildApp>>['app'], user: RuleAdminUser,
  method: 'POST', url: string, payload: unknown
) {
  return target.inject({ method, url, cookies: { scg_session: user.token }, headers: { 'x-csrf-token': user.csrfToken }, payload });
}

function promoteToAdmin(dir: string, userId: string): FileStore {
  const file = path.join(dir, 'db.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { users: Array<{ id: string; role: string }> };
  data.users.find((user) => user.id === userId)!.role = 'ADMIN';
  fs.writeFileSync(file, JSON.stringify(data), 'utf8');
  return new FileStore(dir);
}

function strictRule(): RuleDefinition {
  return {
    id: 'strict', version: 1, status: 'draft', scope: { contract_category: 'construction' },
    conditions: [{ field: 'estimated_price', operator: 'gte', value: 0 }],
    output: { method: '일반경쟁' },
    source: { title: '엄격 승인 테스트 근거', url: 'https://example.org/strict', effectiveFrom: null, checkedAt: '2026-08-30' },
    createdAt: '2026-08-30T00:00:00.000Z', updatedAt: '2026-08-30T00:00:00.000Z'
  };
}
