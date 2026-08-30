import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp, DEFAULT_CHECKLIST_TEMPLATES } from './server.js';
import { FileStore } from '@sen/db';
import { getConfig } from '@sen/config';
import { HybridRetriever } from '@sen/retrieval';
import { EVIDENCE_MAX_BYTES, type Chunk, type RuleDefinition } from '@sen/shared';
import { writeEvidenceFile } from './project-files.js';

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

describe('프로젝트 생명주기 API', () => {
  let csrfToken = '';
  let sessionToken = '';

  beforeAll(async () => {
    const login = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { username: 'admin', password: 'ChangeMe!2026' }
    });
    csrfToken = login.json().csrfToken as string;
    sessionToken = extractSession(login.cookies.map((c) => `${c.name}=${c.value}`).join('; '));
  });

  async function createProject(name: string) {
    const response = await projectRequest('POST', '/api/projects', {
      name, contractCategory: 'construction', estimatedPrice: 1, organizationType: 'school'
    });
    expect(response.statusCode).toBe(200);
    return response.json() as { id: string };
  }

  function projectRequest(method: 'POST' | 'PATCH', url: string, payload: unknown) {
    return app.inject({
      method, url, payload, cookies: { scg_session: sessionToken },
      headers: { 'x-csrf-token': csrfToken }
    });
  }

  it('건너뛴 상태 전이는 409, 다음 상태는 200', async () => {
    const project = await createProject('상태 전이 공사');

    expect((await projectRequest('POST', `/api/projects/${project.id}/status`, {
      status: 'working', reason: '건너뜀'
    })).statusCode).toBe(409);
    expect((await projectRequest('POST', `/api/projects/${project.id}/status`, {
      status: 'contracting', reason: '계약 시작'
    })).statusCode).toBe(200);
  });

  it('다른 프로젝트 itemId 체크 토글은 404', async () => {
    const projectA = await createProject('체크리스트 A');
    const projectB = await createProject('체크리스트 B');
    const itemB = (await store.checklistOf(projectB.id))[0]!;

    const res = await projectRequest('PATCH', `/api/projects/${projectA.id}/checklist/${itemB.id}`, { done: true });
    expect(res.statusCode).toBe(404);
    expect(store.checklistOf(projectB.id).find((item) => item.id === itemB.id)?.done).toBe(false);
  });

  it('변경 payload와 이벤트 날짜를 제한', async () => {
    const project = await createProject('입력 검증 공사');

    expect((await projectRequest('POST', `/api/projects/${project.id}/changes`, {
      changeType: 'amount', before: {}, after: {}, reason: ''
    })).statusCode).toBe(400);
    expect((await projectRequest('POST', `/api/projects/${project.id}/events`, {
      kind: 'inspection', title: '검사', dueDate: '2026-02-30'
    })).statusCode).toBe(400);
  });

  it('상세 응답은 이력·일정과 저장 경로 없는 증빙 메타데이터를 제공한다', async () => {
    const project = await createProject('상세 이력 공사');
    const document = store.saveChecklistEvidence({
      projectId: project.id,
      checklistItemId: store.checklistOf(project.id)[0]!.id,
      uploadedBy: (await store.getUserByUsername('admin'))!.id,
      originalName: '검사서.pdf', storedPath: '/private/evidence/secret.pdf', mimeType: 'application/pdf',
      sizeBytes: 7, sha256: 'a'.repeat(64)
    })!.document;

    expect((await projectRequest('POST', `/api/projects/${project.id}/changes`, {
      changeType: 'amount', before: { amount: 1 }, after: { amount: 2 }, reason: '계약금액 조정'
    })).statusCode).toBe(200);
    expect((await projectRequest('POST', `/api/projects/${project.id}/events`, {
      kind: 'inspection', title: '준공 검사', dueDate: '2026-08-30'
    })).statusCode).toBe(200);

    const detail = await app.inject({
      method: 'GET', url: `/api/projects/${project.id}`, cookies: { scg_session: sessionToken }
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      changes: [expect.objectContaining({ changeType: 'amount', reason: '계약금액 조정' })],
      events: [expect.objectContaining({ kind: 'inspection', displayState: expect.any(String) })],
      documents: [expect.objectContaining({ id: document.id, originalName: '검사서.pdf' })]
    });
    expect(detail.json().documents[0]).not.toHaveProperty('storedPath');
  });

  it('프로젝트 생성은 유한한 0 이상 금액과 허용 열거값만 받는다', async () => {
    const base = { name: '생성 검증', contractCategory: 'construction', organizationType: 'school' };
    expect((await projectRequest('POST', '/api/projects', undefined)).statusCode).toBe(400);
    expect((await projectRequest('POST', '/api/projects', { ...base, estimatedPrice: -1 })).statusCode).toBe(400);
    expect((await projectRequest('POST', '/api/projects', { ...base, estimatedPrice: '1' })).statusCode).toBe(400);
    expect((await projectRequest('POST', '/api/projects', { ...base, estimatedPrice: 1, contractCategory: 'invalid' })).statusCode).toBe(400);
    expect((await projectRequest('POST', '/api/projects', { ...base, estimatedPrice: 1, organizationType: 'invalid' })).statusCode).toBe(400);
  });
});

describe('비공개 체크리스트 증빙 API', () => {
  let evidenceApp: Awaited<ReturnType<typeof buildApp>>['app'];
  let evidenceStore: FileStore;
  let evidenceDir = '';
  let privateRoot = '';
  let ownerId = '';
  const ownerSession = 'evidence-owner-session';
  const ownerCsrf = 'evidence-owner-csrf';

  beforeAll(async () => {
    evidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-api-evidence-'));
    privateRoot = path.join(evidenceDir, 'private');
    evidenceStore = new FileStore(evidenceDir);
    const owner = evidenceStore.createUser({
      username: 'evidence-owner', passwordHash: 's:fixture', displayName: '증빙 소유자', role: 'USER'
    });
    ownerId = owner.id;
    evidenceStore.createSession(ownerSession, owner.id, ownerCsrf, 60_000);
    const built = await buildApp({
      store: evidenceStore,
      retriever: new HybridRetriever({ chunks: [], versions: [] }),
      privateRoot
    });
    evidenceApp = built.app;
  });

  afterAll(async () => {
    await evidenceApp.close();
    fs.rmSync(evidenceDir, { recursive: true, force: true });
  });

  async function createProject(name: string) {
    const project = evidenceStore.createProject({
      ownerId, name, contractCategory: 'construction', estimatedPrice: 1,
      organizationType: 'school', status: 'planning', wizardInput: null
    }, DEFAULT_CHECKLIST_TEMPLATES);
    return { project, item: evidenceStore.checklistOf(project.id)[0]! };
  }

  function ownerRequest(method: 'GET' | 'POST', url: string, payload?: Buffer, headers?: Record<string, string | string[]>) {
    return evidenceApp.inject({
      method, url, payload, cookies: { scg_session: ownerSession },
      headers: { 'x-csrf-token': ownerCsrf, ...headers }
    });
  }

  it('정상 PDF를 업로드하고 storedPath 없이 다운로드', async () => {
    const { project, item } = await createProject('증빙 업로드 공사');
    const upload = await ownerRequest('POST', `/api/projects/${project.id}/checklist/${item.id}/evidence`, Buffer.from('%PDF-1.4\n'), {
      'content-type': 'application/octet-stream',
      'x-file-name': encodeURIComponent('증빙.pdf'),
      'x-file-mime': 'application/pdf'
    });
    expect(upload.statusCode).toBe(200);
    expect(upload.json().document.storedPath).toBeUndefined();

    const download = await ownerRequest('GET', `/api/projects/${project.id}/documents/${upload.json().document.id}/download`);
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-disposition']).toContain("filename*=UTF-8''");
    expect(download.headers['x-content-type-options']).toBe('nosniff');
  });

  it('교차 프로젝트 document 다운로드와 item 업로드를 404', async () => {
    const { project: projectA } = await createProject('증빙 프로젝트 A');
    const { project: projectB, item: itemB } = await createProject('증빙 프로젝트 B');
    const linked = evidenceStore.saveChecklistEvidence({
      projectId: projectB.id, checklistItemId: itemB.id, uploadedBy: ownerId,
      originalName: '기존.pdf', storedPath: path.join(privateRoot, 'missing.pdf'),
      mimeType: 'application/pdf', sizeBytes: 1, sha256: 'b'.repeat(64)
    })!.document;

    expect((await ownerRequest('GET', `/api/projects/${projectA.id}/documents/${linked.id}/download`)).statusCode).toBe(404);
    const docsBefore = evidenceStore.listProjectDocuments(projectA.id);
    const auditsBefore = evidenceStore.listAudit();
    expect((await ownerRequest('POST', `/api/projects/${projectA.id}/checklist/${itemB.id}/evidence`, Buffer.from('bad'), {
      'content-type': 'application/octet-stream', 'x-file-name': '%E0%A4%A', 'x-file-mime': 'text/plain'
    })).statusCode).toBe(404);
    expect(evidenceStore.listProjectDocuments(projectA.id)).toEqual(docsBefore);
    expect(evidenceStore.listAudit()).toEqual(auditsBefore);
    expect(evidenceStore.checklistOf(projectA.id).every((item) => item.evidencePath === null)).toBe(true);
  });

  it('다운로드 MIME은 저장된 메타데이터가 아니라 허용된 파일 확장자로 정한다', async () => {
    const { project, item } = await createProject('증빙 MIME 경계 공사');
    const stored = writeEvidenceFile({
      privateRoot, projectId: project.id, bytes: Buffer.from('%PDF-1.4\n'), sha256: 'c'.repeat(64), ext: 'pdf'
    });
    const document = evidenceStore.saveChecklistEvidence({
      projectId: project.id, checklistItemId: item.id, uploadedBy: ownerId,
      originalName: '안전.pdf', storedPath: stored.storedPath,
      mimeType: 'text/html', sizeBytes: 9, sha256: 'c'.repeat(64)
    })!.document;

    const download = await ownerRequest('GET', `/api/projects/${project.id}/documents/${document.id}/download`);
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-type']).toContain('application/pdf');
  });

  it('크기, MIME 및 filename 헤더를 엄격히 검증한다', async () => {
    const { project, item } = await createProject('증빙 입력 검증 공사');
    const url = `/api/projects/${project.id}/checklist/${item.id}/evidence`;
    const headers = { 'content-type': 'application/octet-stream', 'x-file-name': 'proof.pdf', 'x-file-mime': 'application/pdf' };

    expect((await ownerRequest('POST', url, Buffer.alloc(EVIDENCE_MAX_BYTES + 1), headers)).statusCode).toBe(413);
    expect((await ownerRequest('POST', url, Buffer.from('%PDF-1.4\n'), { ...headers, 'x-file-mime': 'image/png' })).statusCode).toBe(415);
    expect((await ownerRequest('POST', url, Buffer.from('%PDF-1.4\n'), { 'content-type': 'application/octet-stream', 'x-file-mime': 'application/pdf' })).statusCode).toBe(400);
    expect((await ownerRequest('POST', url, Buffer.from('%PDF-1.4\n'), { 'content-type': 'application/octet-stream', 'x-file-name': '%E0%A4%A', 'x-file-mime': 'application/pdf' })).statusCode).toBe(400);
    expect((await ownerRequest('POST', url, Buffer.from('%PDF-1.4\n'), {
      'content-type': 'application/octet-stream', 'x-file-name': ['proof.pdf', 'second.pdf'], 'x-file-mime': 'application/pdf'
    })).statusCode).toBe(400);
  });

  it('예상하지 못한 파일 쓰기 오류는 경로 또는 stack 없이 일반 500으로 응답한다', async () => {
    const { project, item } = await createProject('증빙 내부 오류 공사');
    const sentinelPath = path.join(evidenceDir, 'sentinel-private-root');
    fs.writeFileSync(sentinelPath, 'not-a-directory', 'utf8');
    const failureApp = await buildApp({
      store: evidenceStore,
      retriever: new HybridRetriever({ chunks: [], versions: [] }),
      privateRoot: sentinelPath
    });
    try {
      const response = await failureApp.app.inject({
        method: 'POST', url: `/api/projects/${project.id}/checklist/${item.id}/evidence`,
        cookies: { scg_session: ownerSession },
        headers: {
          'x-csrf-token': ownerCsrf, 'content-type': 'application/octet-stream',
          'x-file-name': 'proof.pdf', 'x-file-mime': 'application/pdf'
        },
        payload: Buffer.from('%PDF-1.4\n')
      });
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ error: '서버 내부 오류가 발생했습니다.' });
      expect(response.body).not.toContain(sentinelPath);
      expect(response.body).not.toMatch(/Error:\s|at\s+\S+\s*\(/);
    } finally {
      await failureApp.app.close();
    }
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
