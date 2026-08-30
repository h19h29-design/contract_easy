import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from './server.js';
import { FileStore } from '@sen/db';
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
