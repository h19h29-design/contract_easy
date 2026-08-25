'use client';

import { useEffect, useState } from 'react';
import { api, type SessionInfo } from '../../../lib/api';

interface Run {
  id: string; mode: string; startedAt: string; finishedAt: string | null;
  status: string; pagesFetched: number; pagesChanged: number;
  attachmentsFetched: number; failures: number;
}
interface Failure { at?: string; url?: string; category?: string; message?: string }

export default function AdminCrawlsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [sourcesCount, setSourcesCount] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ runs: Run[]; recentFailures: Failure[]; sourcesCount: number }>('/api/admin/crawls')
      .then((r) => { setRuns(r.runs); setFailures(r.recentFailures); setSourcesCount(r.sourcesCount); })
      .catch((e) => setError(String(e.message)));
    api<SessionInfo>('/api/auth/me').catch(() => undefined);
  }, []);

  return (
    <div className="container">
      <h1>수집 현황</h1>
      {error && <div className="notice-review">{error} (관리자로 로그인했는지 확인하세요)</div>}

      <section className="card">
        <h2>요약</h2>
        <p>등록된 출처(source): <strong>{sourcesCount}</strong></p>
      </section>

      <section className="card" style={{ overflowX: 'auto' }}>
        <h2>크롤 실행 기록</h2>
        <table className="data">
          <thead><tr><th>시작</th><th>모드</th><th>상태</th><th>페이지</th><th>변경</th><th>실패</th></tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td>{r.startedAt.slice(0, 19).replace('T', ' ')}</td>
                <td>{r.mode}</td>
                <td>{r.status}</td>
                <td>{r.pagesFetched}</td>
                <td>{r.pagesChanged}</td>
                <td>{r.failures}</td>
              </tr>
            ))}
            {runs.length === 0 && <tr><td colSpan={6}>기록 없음</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>최근 실패</h2>
        {failures.length === 0 ? <p className="muted">실패 기록이 없습니다.</p> : (
          <ul>
            {failures.slice(0, 20).map((f, i) => (
              <li key={i}><code>[{f.category}]</code> {f.url} — {f.message}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
