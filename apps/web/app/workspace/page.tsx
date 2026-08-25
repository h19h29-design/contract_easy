'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type SessionInfo } from '../../lib/api';

interface Project {
  id: string;
  name: string;
  contractCategory: string;
  estimatedPrice: number;
  organizationType: string;
  status: string;
  progress: number;
}

export default function WorkspacePage() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState(0);
  const [csrf, setCsrf] = useState('');

  const loadProjects = useCallback(() => {
    api<{ projects: Project[] }>('/api/projects')
      .then((r) => setProjects(r.projects))
      .catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    api<SessionInfo>('/api/auth/me').then((s) => {
      setSession(s);
      if (s.csrfToken) setCsrf(s.csrfToken);
      if (s.loggedIn) loadProjects();
    }).catch(() => setSession({ loggedIn: false }));
  }, [loadProjects]);

  async function login() {
    setError('');
    try {
      const res = await api<SessionInfo & { csrfToken?: string }>('/api/auth/login', { json: { username, password } });
      setSession({ loggedIn: true, user: res.user });
      setCsrf(res.csrfToken ?? '');
      loadProjects();
    } catch (e) {
      setError(String((e as Error).message));
    }
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' });
    setSession({ loggedIn: false });
    setProjects([]);
  }

  async function createProject() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api('/api/projects', {
        method: 'POST',
        headers: csrf ? { 'x-csrf-token': csrf } : undefined,
        json: { name: newName, contractCategory: 'construction', estimatedPrice: Number(newPrice) || 0, organizationType: 'school' }
      });
      setNewName('');
      setNewPrice(0);
      loadProjects();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="container">
      <h1>나의 계약 업무공간</h1>

      {!session ? <p className="muted">확인 중…</p> : !session.loggedIn ? (
        <section className="card" style={{ maxWidth: 420 }}>
          <h2>로그인</h2>
          <label className="field">아이디
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className="field">비밀번호
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void login(); }} />
          </label>
          {error && <p><span className="badge danger">{error}</span></p>}
          <div className="row-actions">
            <button className="btn-primary" onClick={() => void login()}>로그인</button>
          </div>
          <p className="muted" style={{ marginTop: 12 }}>
            개발 기본 계정: admin / ChangeMe!2026 (첫 로그인 후 반드시 변경하세요)
          </p>
        </section>
      ) : (
        <>
          <section className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <h2 style={{ margin: 0 }}>{session.user?.displayName}님의 프로젝트</h2>
              <button onClick={() => void logout()}>로그아웃</button>
            </div>

            {projects.length === 0 && <p className="muted">프로젝트가 없습니다. 아래에서 새로 만들어 보세요.</p>}
            {projects.map((p) => (
              <article key={p.id} className="source-card">
                <Link href={`/workspace/projects/${p.id}`} style={{ fontWeight: 700, fontSize: 15 }}>{p.name}</Link>
                <div className="progressbar" aria-label={`진행률 ${p.progress}%`}><div style={{ width: `${p.progress}%` }} /></div>
                <div className="source-meta">
                  진행률 {p.progress}% · 상태 {p.status}
                </div>
              </article>
            ))}
          </section>

          <section className="card">
            <h2>새 공사계약 프로젝트</h2>
            <label className="field">프로젝트명(공사명)
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="예: ○○초등학교 교실 리모델링" />
            </label>
            <label className="field">추정가격(원, 부가세 제외)
              <input type="number" value={newPrice} onChange={(e) => setNewPrice(Number(e.target.value))} />
            </label>
            <div className="row-actions">
              <button className="btn-primary" disabled={creating || !newName.trim()} onClick={() => void createProject()}>
                {creating ? '생성 중...' : '프로젝트 만들기'}
              </button>
            </div>
            <p className="muted">개인정보·실제 계약서류는 공개 검색에 사용되지 않습니다.</p>
          </section>
        </>
      )}
    </div>
  );
}
