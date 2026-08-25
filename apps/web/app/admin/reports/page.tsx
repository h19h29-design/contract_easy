'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';

interface Report {
  id: string;
  question: string;
  answer: string | null;
  reporterNote: string | null;
  status: 'open' | 'resolved';
  createdAt: string;
}

export default function AdminReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [csrf, setCsrf] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<{ reports: Report[] }>('/api/admin/reports')
      .then((r) => setReports(r.reports))
      .catch((e) => setError(String(e.message)));
    api<{ csrfToken?: string }>('/api/auth/me').then((s) => setCsrf(s.csrfToken ?? ''));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function resolve(id: string) {
    await api(`/api/admin/reports/${id}/resolve`, {
      method: 'POST',
      headers: csrf ? { 'x-csrf-token': csrf } : undefined
    }).catch((e) => setError(String(e.message)));
    load();
  }

  return (
    <div className="container">
      <h1>답변 신고 처리</h1>
      {error && <div className="notice-review">{error}</div>}
      <section className="card">
        {reports.length === 0 && <p className="muted">접수된 신고가 없습니다.</p>}
        {reports.map((r) => (
          <article key={r.id} className="source-card">
            <strong>{r.status === 'open' ? <span className="badge review">미처리</span> : <span className="badge ok">처리완료</span>}</strong>
            <p style={{ margin: '6px 0' }}>질문: {r.question}</p>
            {r.reporterNote && <p className="muted">메모: {r.reporterNote}</p>}
            <div className="source-meta">접수: {r.createdAt.slice(0, 19).replace('T', ' ')}</div>
            {r.status === 'open' && (
              <div className="row-actions">
                <button className="btn-sm" onClick={() => void resolve(r.id)}>처리 완료</button>
              </div>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
