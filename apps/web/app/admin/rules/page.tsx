'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type SessionInfo } from '../../../lib/api';

interface RuleRow {
  id: string; version: number; status: 'draft' | 'reviewed' | 'active' | 'superseded';
  output: { method?: string; message?: string };
  source: { title: string; url: string; effectiveFrom?: string | null; checkedAt: string };
  candidate?: { quotedSentence: string; contextBefore: string; contextAfter: string };
}
interface Conflict { ruleVersionIdA: string; ruleVersionIdB: string; reason: string }
interface RevisionForm {
  method: string; lower: string; lowerInclusive: boolean; upper: string; upperInclusive: boolean;
  message: string; title: string; url: string; effectiveFrom: string; checkedAt: string;
}

const STATUS_BADGE: Record<string, string> = { draft: '', reviewed: 'info', active: 'ok', superseded: 'danger' };
const emptyRevision = (rule: RuleRow): RevisionForm => ({
  method: rule.output.method ?? '', lower: '', lowerInclusive: true, upper: '', upperInclusive: true,
  message: rule.output.message ?? '', title: rule.source.title, url: rule.source.url,
  effectiveFrom: rule.source.effectiveFrom ?? '', checkedAt: rule.source.checkedAt?.slice(0, 10) ?? ''
});

export default function AdminRulesPage() {
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [csrf, setCsrf] = useState('');
  const [role, setRole] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState('');
  const [reviewComment, setReviewComment] = useState<Record<string, string>>({});
  const [sourceConfirmed, setSourceConfirmed] = useState<Record<string, boolean>>({});
  const [revision, setRevision] = useState<Record<string, RevisionForm>>({});

  const load = useCallback(async () => {
    try {
      const [result, session] = await Promise.all([
        api<{ rules: RuleRow[]; conflicts: Conflict[] }>('/api/admin/rules'), api<SessionInfo>('/api/auth/me')
      ]);
      setRules(result.rules); setConflicts(result.conflicts); setCsrf(session.csrfToken ?? ''); setRole(session.user?.role ?? '');
    } catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function act(rule: RuleRow, action: 'review' | 'hold' | 'activate') {
    const key = `${rule.id}@${rule.version}`;
    setError(''); setSubmitting(key);
    const comment = reviewComment[key]?.trim() ?? '';
    try {
      await api(`/api/admin/rules/${encodeURIComponent(rule.id)}/${rule.version}`, {
        method: 'POST', headers: csrf ? { 'x-csrf-token': csrf } : undefined,
        json: action === 'review' ? { action, comment, sourceConfirmed: sourceConfirmed[key] === true }
          : action === 'hold' ? { action, comment } : { action }
      });
      await load();
    } catch (e) { setError((e as Error).message); } finally { setSubmitting(''); }
  }

  async function createRevision(rule: RuleRow) {
    const key = `${rule.id}@${rule.version}`;
    const form = revision[key] ?? emptyRevision(rule);
    const numberOrNull = (value: string) => value.trim() === '' ? null : Number(value);
    setError(''); setSubmitting(`${key}:revision`);
    try {
      await api(`/api/admin/rules/${encodeURIComponent(rule.id)}/${rule.version}/revisions`, {
        method: 'POST', headers: csrf ? { 'x-csrf-token': csrf } : undefined,
        json: {
          method: form.method, lower: numberOrNull(form.lower), lowerInclusive: form.lowerInclusive,
          upper: numberOrNull(form.upper), upperInclusive: form.upperInclusive, message: form.message,
          source: { title: form.title, url: form.url, effectiveFrom: form.effectiveFrom || null, checkedAt: form.checkedAt }
        }
      });
      await load();
    } catch (e) { setError((e as Error).message); } finally { setSubmitting(''); }
  }

  function updateRevision(rule: RuleRow, field: keyof RevisionForm, value: string | boolean) {
    const key = `${rule.id}@${rule.version}`;
    setRevision((current) => ({ ...current, [key]: { ...(current[key] ?? emptyRevision(rule)), [field]: value } }));
  }

  return <div className="container">
    <h1>규칙 후보 검토·승인</h1>
    <p className="muted">규칙은 원문 검토와 별도 승인 후에만 계약 안내에 사용됩니다.</p>
    <div className="notice-review" aria-live="polite" hidden={!error}>{error}</div>
    {conflicts.length > 0 && <section className="card"><h2>충돌 감지</h2><ul>{conflicts.map((c, i) => <li key={i}><code>{c.ruleVersionIdA}</code> vs <code>{c.ruleVersionIdB}</code> — {c.reason}</li>)}</ul></section>}
    <section className="card">
      <h2>규칙 목록 ({rules.length})</h2>
      {rules.map((rule) => {
        const key = `${rule.id}@${rule.version}`;
        const form = revision[key] ?? emptyRevision(rule);
        const busy = submitting === key;
        const revisionBusy = submitting === `${key}:revision`;
        return <article key={key} className="source-card">
          <h3><span className={`badge ${STATUS_BADGE[rule.status]}`}>{rule.status}</span> {rule.id}@{rule.version}</h3>
          <table className="data"><tbody>
            <tr><th>후보값</th><td>{rule.output.method ?? '(없음)'}</td></tr>
            {rule.candidate && <><tr><th>원문 문장</th><td>{rule.candidate.quotedSentence}</td></tr><tr><th>앞 문맥</th><td className="muted">…{rule.candidate.contextBefore || '(없음)'}</td></tr><tr><th>뒤 문맥</th><td className="muted">{rule.candidate.contextAfter || '(없음)'}…</td></tr></>}
            <tr><th>메시지</th><td>{rule.output.message}</td></tr><tr><th>원문 제목</th><td>{rule.source.title}</td></tr>
            <tr><th>원문 URL</th><td><a href={rule.source.url} target="_blank" rel="noreferrer noopener">{rule.source.url}</a></td></tr>
            <tr><th>게시일/시행일</th><td>{rule.source.effectiveFrom ?? '미확인'}</td></tr><tr><th>마지막 확인일</th><td>{rule.source.checkedAt?.slice(0, 10)}</td></tr>
          </tbody></table>
          {rule.status === 'draft' && <div className="form-section">
            <label className="field">검토 의견<textarea value={reviewComment[key] ?? ''} onChange={(e) => setReviewComment((v) => ({ ...v, [key]: e.target.value }))} /></label>
            <label className="checkbox-field"><input type="checkbox" checked={sourceConfirmed[key] ?? false} onChange={(e) => setSourceConfirmed((v) => ({ ...v, [key]: e.target.checked }))} /> 원문 대조 확인</label>
            <div className="row-actions"><button className="btn-sm btn-primary" disabled={busy} onClick={() => void act(rule, 'review')}>검토 완료</button><button className="btn-sm" disabled={busy} onClick={() => void act(rule, 'hold')}>보류</button></div>
          </div>}
          {rule.status === 'reviewed' && role === 'ADMIN' && <div className="row-actions"><button className="btn-sm btn-primary" disabled={busy} onClick={() => void act(rule, 'activate')}>활성화</button></div>}
          {role === 'REVIEWER' && <details className="form-section"><summary>새 버전 만들기</summary>
            <label className="field">계약방법<input value={form.method} onChange={(e) => updateRevision(rule, 'method', e.target.value)} /></label>
            <div className="form-grid"><label className="field">하한(선택)<input type="number" value={form.lower} onChange={(e) => updateRevision(rule, 'lower', e.target.value)} /></label><label className="field">상한(선택)<input type="number" value={form.upper} onChange={(e) => updateRevision(rule, 'upper', e.target.value)} /></label></div>
            <div className="row-actions"><label className="checkbox-field"><input type="checkbox" checked={form.lowerInclusive} onChange={(e) => updateRevision(rule, 'lowerInclusive', e.target.checked)} /> 하한 포함</label><label className="checkbox-field"><input type="checkbox" checked={form.upperInclusive} onChange={(e) => updateRevision(rule, 'upperInclusive', e.target.checked)} /> 상한 포함</label></div>
            <label className="field">메시지<textarea value={form.message} onChange={(e) => updateRevision(rule, 'message', e.target.value)} /></label><label className="field">원문 제목<input value={form.title} onChange={(e) => updateRevision(rule, 'title', e.target.value)} /></label><label className="field">원문 URL<input type="url" value={form.url} onChange={(e) => updateRevision(rule, 'url', e.target.value)} /></label>
            <div className="form-grid"><label className="field">시행일(선택)<input type="date" value={form.effectiveFrom} onChange={(e) => updateRevision(rule, 'effectiveFrom', e.target.value)} /></label><label className="field">확인일<input type="date" value={form.checkedAt} onChange={(e) => updateRevision(rule, 'checkedAt', e.target.value)} /></label></div>
            <button className="btn-sm" disabled={revisionBusy} onClick={() => void createRevision(rule)}>새 버전 저장</button>
          </details>}
        </article>;
      })}
      {rules.length === 0 && <p className="muted">규칙 후보가 없습니다.</p>}
    </section>
  </div>;
}
