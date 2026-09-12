import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../../apps/web/lib/api';

afterEach(() => vi.unstubAllGlobals());

it('로그인한 사용자의 검색 POST와 로그아웃에 세션 CSRF 토큰을 보낸다', async () => {
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith('/api/auth/me')) return Response.json({ loggedIn: true, csrfToken: 'synthetic-csrf' });
    expect(new Headers(init.headers).get('x-csrf-token')).toBe('synthetic-csrf');
    return Response.json({ ok: true });
  });
  vi.stubGlobal('fetch', fetcher);
  await api('/api/ask', { json: { question: '계약' } });
  await api('/api/auth/logout', { method: 'POST' });
  expect(fetcher).toHaveBeenCalledTimes(4);
});

it('비로그인 검색은 토큰 없이 동작한다', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith('/api/auth/me')) return Response.json({ loggedIn: false });
    expect(new Headers(init.headers).has('x-csrf-token')).toBe(false);
    return Response.json({ answered: false });
  }));
  expect(await api('/api/ask', { json: { question: '계약' } })).toEqual({ answered: false });
});

it('명시한 CSRF 헤더는 보존하고 로그인에는 세션 조회를 추가하지 않는다', async () => {
  const fetcher = vi.fn(async () => Response.json({ ok: true }));
  vi.stubGlobal('fetch', fetcher);
  await api('/api/projects', { json: {}, headers: { 'x-csrf-token': 'explicit-test' } });
  await api('/api/auth/login', { json: {} });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
