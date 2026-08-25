export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.json !== undefined) headers.set('content-type', 'application/json');
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    method: init?.method ?? (init?.json !== undefined ? 'POST' : 'GET'),
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
