'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { API_URL, api } from '../../../../lib/api';

interface Step { id: string; stageKey: string; label: string; status: 'pending' | 'in_progress' | 'done' }
interface ChecklistItem { id: string; stepId: string; label: string; done: boolean; required: boolean; evidencePath: string | null }
interface Document { id: string; originalName: string; mimeType: string; sizeBytes: number; uploadedAt: string }
interface Change { id: string; changeType: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; reason: string; at: string }
interface Event { id: string; kind: string; title: string; dueDate: string; displayState: string }
interface ProjectDetail {
  project: { id: string; name: string; status: string; estimatedPrice: number };
  steps: Step[]; checklist: ChecklistItem[]; progress: number; documents: Document[]; changes: Change[]; events: Event[];
}

const STATUS_LABEL: Record<string, string> = { pending: '대기', in_progress: '진행중', done: '완료' };
const NEXT_STATUS: Record<string, string | null> = { planning: 'contracting', contracting: 'working', working: 'completed', completed: 'warranty', warranty: null };
const EVENT_STATE_LABEL: Record<string, string> = { upcoming: '예정', today: '오늘', overdue: '기한경과' };

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = useState<ProjectDetail | null>(null);
  const [csrf, setCsrf] = useState('');
  const [error, setError] = useState('');
  const [statusReason, setStatusReason] = useState('');
  const [changeType, setChangeType] = useState('other');
  const [before, setBefore] = useState('{}');
  const [after, setAfter] = useState('{}');
  const [changeReason, setChangeReason] = useState('');
  const [eventKind, setEventKind] = useState('milestone');
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [submitting, setSubmitting] = useState('');

  const load = useCallback(async () => {
    try {
      const [detail, session] = await Promise.all([api<ProjectDetail>(`/api/projects/${id}`), api<{ csrfToken?: string }>('/api/auth/me')]);
      setData(detail); setCsrf(session.csrfToken ?? '');
    } catch (e) { setError((e as Error).message); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function mutate(key: string, request: () => Promise<unknown>) {
    setError(''); setSubmitting(key);
    try { await request(); await load(); } catch (e) { setError((e as Error).message); } finally { setSubmitting(''); }
  }

  function toggle(itemId: string, done: boolean) {
    return mutate(`check:${itemId}`, () => api(`/api/projects/${id}/checklist/${itemId}`, {
      method: 'PATCH', headers: csrf ? { 'x-csrf-token': csrf } : undefined, json: { done }
    }));
  }

  function upload(itemId: string, file: File) {
    return mutate(`upload:${itemId}`, () => api(`/api/projects/${id}/checklist/${itemId}/evidence`, {
      method: 'POST', body: file,
      headers: { 'content-type': 'application/octet-stream', 'x-file-name': encodeURIComponent(file.name), 'x-file-mime': file.type, ...(csrf ? { 'x-csrf-token': csrf } : {}) }
    }));
  }

  function transition() {
    const next = data ? NEXT_STATUS[data.project.status] : null;
    if (!next) return;
    return mutate('status', () => api(`/api/projects/${id}/status`, {
      method: 'POST', headers: csrf ? { 'x-csrf-token': csrf } : undefined, json: { status: next, reason: statusReason }
    }));
  }

  function addChange() {
    let parsedBefore: Record<string, unknown> | null;
    let parsedAfter: Record<string, unknown> | null;
    try {
      parsedBefore = JSON.parse(before) as Record<string, unknown>;
      parsedAfter = JSON.parse(after) as Record<string, unknown>;
      if (parsedBefore === null || Array.isArray(parsedBefore) || parsedAfter === null || Array.isArray(parsedAfter)) throw new Error();
    } catch { setError('변경 전·후 값은 JSON 객체여야 합니다.'); return; }
    void mutate('change', () => api(`/api/projects/${id}/changes`, {
      method: 'POST', headers: csrf ? { 'x-csrf-token': csrf } : undefined,
      json: { changeType, before: parsedBefore, after: parsedAfter, reason: changeReason }
    }));
  }

  function addEvent() {
    void mutate('event', () => api(`/api/projects/${id}/events`, {
      method: 'POST', headers: csrf ? { 'x-csrf-token': csrf } : undefined,
      json: { kind: eventKind, title: eventTitle, dueDate: eventDate }
    }));
  }

  if (!data) return <div className="container"><div className="notice-review" aria-live="polite" hidden={!error}>{error}</div><p className="muted">불러오는 중…</p></div>;
  const byStep = new Map<string, ChecklistItem[]>();
  for (const item of data.checklist) byStep.set(item.stepId, [...(byStep.get(item.stepId) ?? []), item]);
  const documents = new Map(data.documents.map((document) => [document.id, document]));
  const next = NEXT_STATUS[data.project.status];

  return <div className="container">
    <h1>{data.project.name}</h1>
    <p>추정가격: {data.project.estimatedPrice.toLocaleString()}원 · 전체 진행률 {data.progress}%</p>
    <div className="progressbar" aria-label={`전체 진행률 ${data.progress}%`}><div style={{ width: `${data.progress}%` }} /></div>
    <div className="notice-review" aria-live="polite" hidden={!error}>{error}</div>

    <section className="card"><h2>상태</h2>
      <p>현재 상태: <strong data-testid="current-status">{data.project.status}</strong>{next ? ' · 다음 단계로 이동할 수 있습니다.' : ' · 마지막 단계입니다.'}</p>
      {next && <><label className="field">상태 변경 사유<input value={statusReason} onChange={(e) => setStatusReason(e.target.value)} /></label><button className="btn-primary" disabled={submitting === 'status' || !statusReason.trim()} onClick={() => void transition()}>{next}으로 이동</button></>}
      <p className="muted">상태 표시는 업무 기록용이며 법정 기한이나 계약상 의무를 자동으로 판단하지 않습니다.</p>
    </section>

    <section className="card"><h2>체크리스트·증빙</h2>
      {data.steps.map((step) => {
        const items = byStep.get(step.id) ?? [];
        return <div key={step.id} className="project-step"><h3>{step.label} <span className={`badge ${step.status === 'done' ? 'ok' : step.status === 'in_progress' ? 'info' : ''}`}>{STATUS_LABEL[step.status]}</span></h3>
          {items.map((item) => {
            const document = item.evidencePath ? documents.get(item.evidencePath) : undefined;
            return <div key={item.id} className="check-item"><label><input type="checkbox" checked={item.done} disabled={submitting === `check:${item.id}`} onChange={(e) => void toggle(item.id, e.target.checked)} />{item.label}</label>
              {document ? <p className="source-meta" data-testid="evidence-current">현재 증빙: <a href={`${API_URL}/api/projects/${id}/documents/${document.id}/download`}>{document.originalName}</a> · {document.mimeType} · {document.sizeBytes.toLocaleString()} bytes · 업로드: {document.uploadedAt} (교체하려면 파일 선택)</p> : <p className="source-meta">증빙 없음 — 완료 표시는 가능하지만 원문 확인이 필요합니다.</p>}
              <label className="field">증빙 파일<input type="file" accept=".pdf,.jpg,.jpeg,.png" disabled={submitting === `upload:${item.id}`} onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(item.id, file); }} /></label>
            </div>;
          })}
        </div>;
      })}
      <p className="muted">형식 검증은 악성 파일이 아니라는 보장이 아닙니다. 신뢰할 수 있는 증빙만 내려받으세요.</p>
    </section>

    <section className="card"><h2>변경 기록</h2>
      <label className="field">변경 유형<select value={changeType} onChange={(e) => setChangeType(e.target.value)}><option value="design">설계</option><option value="duration">기간</option><option value="amount">금액</option><option value="other">기타</option></select></label>
      <div className="form-grid"><label className="field">변경 전 JSON<textarea value={before} onChange={(e) => setBefore(e.target.value)} /></label><label className="field">변경 후 JSON<textarea value={after} onChange={(e) => setAfter(e.target.value)} /></label></div>
      <label className="field">변경 사유<input value={changeReason} onChange={(e) => setChangeReason(e.target.value)} /></label><button disabled={submitting === 'change' || !changeReason.trim()} onClick={addChange}>변경 기록 추가</button>
      <ul className="history-list" data-testid="project-history">{data.changes.map((change) => <li key={change.id} data-testid={change.changeType === 'status' ? 'status-transition-history' : undefined}><strong>{change.changeType}</strong> · {change.changeType === 'status' ? <span data-testid="status-transition-reason">{change.reason}</span> : change.reason} <span className="muted">({change.at.slice(0, 10)})</span></li>)}</ul>
    </section>

    <section className="card"><h2>일정</h2>
      <label className="field">일정 종류<select value={eventKind} onChange={(e) => setEventKind(e.target.value)}><option value="milestone">마일스톤</option><option value="deadline">기한</option><option value="inspection">검사</option><option value="payment">대금</option><option value="other">기타</option></select></label>
      <label className="field">마일스톤 제목<input value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} /></label><label className="field">마일스톤 날짜<input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} /></label>
      <button disabled={submitting === 'event' || !eventTitle.trim() || !eventDate} onClick={addEvent}>일정 추가</button>
      <ul className="history-list">{data.events.map((event) => <li key={event.id}><span className="badge info" data-testid="event-state">{EVENT_STATE_LABEL[event.displayState] ?? event.displayState}</span> {event.title} · {event.dueDate}</li>)}</ul>
    </section>
    <p className="muted">모든 변경은 감사로그에 기록됩니다.</p>
  </div>;
}
