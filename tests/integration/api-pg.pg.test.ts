import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PgStore } from '@sen/db';
import { HybridRetriever } from '@sen/retrieval';
import type { Chunk, RuleDefinition } from '@sen/shared';
import { buildApp } from '../../apps/api/src/server.js';

/** API가 PostgreSQL 모드로 동작하는지 확인하는 통합 테스트 */
let app: Awaited<ReturnType<typeof buildApp>>['app'];
let store: PgStore;
let privateRoot = '';
const url = process.env.PG_TEST_URL!;

beforeAll(async () => {
  store = await PgStore.connect(url);
  const { hashPassword } = await import('@sen/db');
  // 다른 스펙이 사용자를 만들었을 수 있으므로 admin을 명시 시딩
  if (!(await store.getUserByUsername('admin'))) {
    await store.createUser({
      username: 'admin', passwordHash: hashPassword('ChangeMe!2026'),
      displayName: '시스템 관리자', role: 'ADMIN'
    });
  }
  const chunk: Chunk = {
    id: 'pgc1', sourceVersionId: 'svx', url: 'https://contract.sen.go.kr/fus/pg',
    docTitle: 'PG 문서', sectionPath: [], order: 0, type: 'paragraph',
    text: '전자입찰 공지사항 본문입니다.', meta: {}
  };
  await store.replaceChunks([chunk]);
  const retriever = new HybridRetriever({ chunks: [chunk], versions: [] });
  privateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scg-api-pg-evidence-'));
  ({ app } = await buildApp({ store, retriever, privateRoot }));
});

afterAll(async () => {
  await app.close();
  await store.close();
  fs.rmSync(privateRoot, { recursive: true, force: true });
});

describe('API PostgreSQL 모드', () => {
  it('health가 정상 응답', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });

  it('로그인 → 프로젝트 생성이 PG 기반으로 동작', async () => {
    const login = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { username: 'admin', password: 'ChangeMe!2026' }
    });
    expect(login.statusCode).toBe(200);
    const csrf = login.json().csrfToken as string;
    const cookie = login.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const sessionToken = cookie.split('=').pop()!;

    const created = await app.inject({
      method: 'POST', url: '/api/projects',
      cookies: { scg_session: sessionToken },
      headers: { 'x-csrf-token': csrf },
      payload: { name: 'PG 모드 공사', contractCategory: 'construction', estimatedPrice: 1, organizationType: 'school' }
    });
    expect(created.statusCode).toBe(200);

    const detail = await app.inject({
      method: 'GET', url: `/api/projects/${created.json().id}`,
      cookies: { scg_session: sessionToken }
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().steps).toHaveLength(10);
  });

  it('PG API도 다른 프로젝트의 체크리스트 항목을 수정하지 못한다', async () => {
    const login = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { username: 'admin', password: 'ChangeMe!2026' }
    });
    const csrf = login.json().csrfToken as string;
    const sessionToken = login.cookies.find((cookie) => cookie.name === 'scg_session')!.value;
    const createProject = async (name: string) => {
      const response = await app.inject({
        method: 'POST', url: '/api/projects', cookies: { scg_session: sessionToken },
        headers: { 'x-csrf-token': csrf },
        payload: { name, contractCategory: 'construction', estimatedPrice: 1, organizationType: 'school' }
      });
      expect(response.statusCode).toBe(200);
      return response.json() as { id: string };
    };
    const projectA = await createProject('PG 체크리스트 A');
    const projectB = await createProject('PG 체크리스트 B');
    const itemB = (await store.checklistOf(projectB.id))[0]!;

    const response = await app.inject({
      method: 'PATCH', url: `/api/projects/${projectA.id}/checklist/${itemB.id}`,
      cookies: { scg_session: sessionToken }, headers: { 'x-csrf-token': csrf }, payload: { done: true }
    });
    expect(response.statusCode).toBe(404);
    expect((await store.checklistOf(projectB.id)).find((item) => item.id === itemB.id)?.done).toBe(false);
  });

  it('PG API는 증빙 메타데이터를 저장하고 프로젝트 범위에서만 다운로드한다', async () => {
    const login = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { username: 'admin', password: 'ChangeMe!2026' }
    });
    const csrf = login.json().csrfToken as string;
    const sessionToken = login.cookies.find((cookie) => cookie.name === 'scg_session')!.value;
    const createProject = async (name: string) => {
      const response = await app.inject({
        method: 'POST', url: '/api/projects', cookies: { scg_session: sessionToken },
        headers: { 'x-csrf-token': csrf },
        payload: { name, contractCategory: 'construction', estimatedPrice: 1, organizationType: 'school' }
      });
      expect(response.statusCode).toBe(200);
      return response.json() as { id: string };
    };
    const projectA = await createProject('PG 증빙 A');
    const projectB = await createProject('PG 증빙 B');
    const itemA = (await store.checklistOf(projectA.id))[0]!;

    const beforeAudits = (await store.listAudit()).length;
    const upload = await app.inject({
      method: 'POST', url: `/api/projects/${projectA.id}/checklist/${itemA.id}/evidence`,
      cookies: { scg_session: sessionToken },
      headers: {
        'x-csrf-token': csrf, 'content-type': 'application/octet-stream',
        'x-file-name': encodeURIComponent('PG 증빙.pdf'), 'x-file-mime': 'application/pdf'
      },
      payload: Buffer.from('%PDF-1.4\n')
    });
    expect(upload.statusCode).toBe(200);
    expect(upload.json().document.storedPath).toBeUndefined();
    const audits = await store.listAudit();
    expect(audits).toHaveLength(beforeAudits + 1);
    expect(audits[0]).toMatchObject({ action: 'checklist.evidence.save', detail: { checklistItemId: itemA.id, sha256: expect.any(String) } });
    expect(audits[0]?.detail).not.toHaveProperty('storedPath');

    const documentId = upload.json().document.id as string;
    const download = await app.inject({
      method: 'GET', url: `/api/projects/${projectA.id}/documents/${documentId}/download`,
      cookies: { scg_session: sessionToken }
    });
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-disposition']).toContain("filename*=UTF-8''");
    expect((await app.inject({
      method: 'GET', url: `/api/projects/${projectB.id}/documents/${documentId}/download`,
      cookies: { scg_session: sessionToken }
    })).statusCode).toBe(404);
  });

  it('출처 목록이 PG에서 조회됨', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/sources' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().sources)).toBe(true);
  });

  it('REVIEWER review 후 같은 ID activation을 거부하고 다른 ADMIN은 성공', async () => {
    const reviewer = await store.createUser({ username: 'pg-api-reviewer', passwordHash: 's:fixture', displayName: 'PG Reviewer', role: 'REVIEWER' });
    const admin2 = await store.createUser({ username: 'pg-api-admin2', passwordHash: 's:fixture', displayName: 'PG Admin 2', role: 'ADMIN' });
    await store.createSession('pg-api-reviewer-token', reviewer.id, 'pg-api-reviewer-csrf', 60_000);
    await store.createSession('pg-api-admin2-token', admin2.id, 'pg-api-admin2-csrf', 60_000);
    await store.upsertRule(strictRule());

    const reviewed = await injectAs('pg-api-reviewer-token', 'pg-api-reviewer-csrf', {
      action: 'review', comment: '원문과 경계 확인', sourceConfirmed: true
    });
    expect(reviewed.statusCode).toBe(200);

    await (store as unknown as { pool: { query: (sql: string, values: unknown[]) => Promise<unknown> } }).pool.query(
      "UPDATE users SET role='ADMIN' WHERE id=$1", [reviewer.id]
    );
    expect((await injectAs('pg-api-reviewer-token', 'pg-api-reviewer-csrf', { action: 'activate' })).statusCode).toBe(409);
    expect((await injectAs('pg-api-admin2-token', 'pg-api-admin2-csrf', { action: 'activate' })).statusCode).toBe(200);
  });
});

function injectAs(token: string, csrfToken: string, payload: unknown) {
  return app.inject({
    method: 'POST', url: '/api/admin/rules/pg-api-strict/1',
    cookies: { scg_session: token }, headers: { 'x-csrf-token': csrfToken }, payload
  });
}

function strictRule(): RuleDefinition {
  return {
    id: 'pg-api-strict', version: 1, status: 'draft', scope: { organization_type: 'api-pg-isolated' },
    conditions: [{ field: 'estimated_price', operator: 'gte', value: 0 }], output: { method: '일반경쟁' },
    source: { title: 'PG 엄격 승인 테스트 근거', url: 'https://example.org/pg-api-strict', effectiveFrom: null, checkedAt: '2026-08-30' },
    createdAt: '2026-08-30T00:00:00.000Z', updatedAt: '2026-08-30T00:00:00.000Z'
  };
}
