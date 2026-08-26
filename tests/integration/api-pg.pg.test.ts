import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PgStore } from '@sen/db';
import { HybridRetriever } from '@sen/retrieval';
import type { Chunk } from '@sen/shared';
import { buildApp } from '../../apps/api/src/server.js';

/** API가 PostgreSQL 모드로 동작하는지 확인하는 통합 테스트 */
let app: Awaited<ReturnType<typeof buildApp>>['app'];
let store: PgStore;
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
  ({ app } = await buildApp({ store, retriever }));
});

afterAll(async () => {
  await app.close();
  await store.close();
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

  it('출처 목록이 PG에서 조회됨', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/sources' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().sources)).toBe(true);
  });
});
