export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.json !== undefined) headers.set('content-type', 'application/json');
  const method = (init?.method ?? (init?.json !== undefined ? 'POST' : 'GET')).toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && path !== '/api/auth/login' && !headers.has('x-csrf-token')) {
    const session = await api<SessionInfo>('/api/auth/me');
    if (session.loggedIn && session.csrfToken) headers.set('x-csrf-token', session.csrfToken);
  }
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    method,
    headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    credentials: 'include',
    cache: 'no-store'
  });
  const data = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) throw Object.assign(new Error((data as { error?: string }).error ?? `HTTP ${res.status}`), { status: res.status, body: data });
  return data;
}

export interface SessionInfo {
  loggedIn: boolean;
  user?: { id: string; username: string; displayName: string; role: string };
  csrfToken?: string;
}
