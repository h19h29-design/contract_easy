'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';

interface RuleRow {
  id: string;
  version: number;
  status: 'draft' | 'reviewed' | 'active' | 'superseded';
  scope: Record<string, string>;
  output: { method?: string; message?: string };
  source: { title: string; url: string; effectiveFrom?: string | null; checkedAt: string };
  candidate?: {
    kindOfValue: string;
    quotedSentence: string;
    contextBefore: string;
    contextAfter: string;
    sourceChunkId?: string;
  };
}
interface Conflict { ruleVersionIdA: string; ruleVersionIdB: string; reason: string }

const STATUS_BADGE: Record<string, string> = {
  draft: '', reviewed: 'info', active: 'ok', superseded: 'danger'
};

export default function AdminRulesPage() {
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [csrf, setCsrf] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    api<{ rules: RuleRow[]; conflicts: Conflict[] }>('/api/admin/rules')
      .then((r) => { setRules(r.rules); setConflicts(r.conflicts); })
      .catch((e) => setError(String(e.message)));
    api<{ csrfToken?: string }>('/api/auth/me').then((s) => setCsrf(s.csrfToken ?? ''));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function act(rule: RuleRow, action: 'review' | 'activate' | 'reject') {
    setMsg('');
    try {
      await api(`/api/admin/rules/${encodeURIComponent(rule.id)}/${rule.version}`, {
        method: 'POST',
        headers: csrf ? { 'x-csrf-token': csrf } : undefined,
        json: { action }
      });
      load();
    } catch (e) {
      setError(String((e as Error).message));
    }
  }

  return (
    <div className="container">
      <h1>규칙 후보 검토·승인</h1>
      <p className="muted">
        규칙 상태 흐름: draft → reviewed → active → superseded.
        draft는 반드시 <strong>검토(review)</strong>를 거친 뒤에만 활성화할 수 있습니다.
        활성화된 규칙만 계약 안내 마법사에 사용됩니다.
      </p>

      {error && <div className="notice-review">{error} (REVIEWER/ADMIN 권한 필요)</div>}
      {msg && <div className="notice-ai">{msg}</div>}

      {conflicts.length > 0 && (
        <section className="card">
          <h2>⚠️ 충돌 감지</h2>
          <ul>
            {conflicts.map((c, i) => (
              <li key={i}><code>{c.ruleVersionIdA}</code> vs <code>{c.ruleVersionIdB}</code> — {c.reason}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>규칙 목록 ({rules.length})</h2>
        {rules.map((r) => (
          <article key={`${r.id}@${r.version}`} className="source-card">
            <summary style={{ fontWeight: 700 }}>
              <span className={`badge ${STATUS_BADGE[r.status]}`}>{r.status}</span>{' '}
              {r.id}@{r.version}
            </summary>
            <table className="data">
              <tbody>
                <tr><th style={{ width: 120 }}>출력(후보값)</th><td>{r.output.method ?? '(없음)'}</td></tr>
                {r.candidate && (
                  <>
                    <tr><th>원문 문장</th><td style={{ background: '#fffbe9' }}>{r.candidate.quotedSentence}</td></tr>
                    <tr><th>앞 문맥</th><td className="muted">…{r.candidate.contextBefore || '(없음)'}</td></tr>
                    <tr><th>뒤 문맥</th><td className="muted">{r.candidate.contextAfter || '(없음)'}…</td></tr>
                  </>
                )}
                <tr><th>메시지</th><td>{r.output.message}</td></tr>
                <tr><th>원문 제목</th><td>{r.source.title}</td></tr>
                <tr><th>원문 URL</th><td><a href={r.source.url} target="_blank" rel="noreferrer noopener">{r.source.url}</a></td></tr>
                <tr><th>게시일/시행일</th><td>{String(r.source.effectiveFrom ?? '미확인')}</td></tr>
                <tr><th>마지막 확인일</th><td>{r.source.checkedAt?.slice(0, 10)}</td></tr>
              </tbody>
            </table>
            <div className="row-actions">
              {r.status === 'draft' && <button className="btn-sm" onClick={() => void act(r, 'review')}>검토 완료(reviewed)</button>}
              {r.status === 'reviewed' && <button className="btn-sm btn-primary" onClick={() => void act(r, 'activate')}>승인(active)</button>}
              {(r.status === 'draft' || r.status === 'reviewed') && (
                <button className="btn-sm" onClick={() => void act(r, 'reject')} style={{ borderColor: '#d9a0a0', color: '#a11212' }}>반려</button>
              )}
            </div>
          </article>
        ))}
        {rules.length === 0 && <p className="muted">규칙 후보가 없습니다. `pnpm ingest:all` 실행 후 확인하세요.</p>}
      </section>
    </div>
  );
}
