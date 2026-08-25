'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../../../lib/api';

interface Step {
  id: string;
  stageKey: string;
  label: string;
  sortOrder: number;
  status: 'pending' | 'in_progress' | 'done';
}
interface ChecklistItem {
  id: string;
  stepId: string;
  label: string;
  done: boolean;
}
interface ProjectDetail {
  project: { id: string; name: string; status: string; estimatedPrice: number };
  steps: Step[];
  checklist: ChecklistItem[];
  progress: number;
}

const STATUS_LABEL: Record<string, string> = {
  pending: '대기', in_progress: '진행중', done: '완료'
};

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = useState<ProjectDetail | null>(null);
  const [csrf, setCsrf] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<ProjectDetail>(`/api/projects/${id}`)
      .then((d) => { setData(d); })
      .catch((e) => setError(String(e.message)));
    api<{ csrfToken?: string }>('/api/auth/me').then((s) => setCsrf(s.csrfToken ?? ''));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function toggle(itemId: string, done: boolean) {
    await api(`/api/projects/${id}/checklist/${itemId}`, {
      method: 'PATCH',
      headers: csrf ? { 'x-csrf-token': csrf } : undefined,
      json: { done }
    }).catch(() => setError('권한이 없거나 세션이 만료되었습니다.'));
    load();
  }

  if (error) return <div className="container"><div className="notice-review">{error}</div></div>;
  if (!data) return <div className="container"><p className="muted">불러오는 중…</p></div>;

  const byStep = new Map<string, ChecklistItem[]>();
  for (const item of data.checklist) {
    if (!byStep.has(item.stepId)) byStep.set(item.stepId, []);
    byStep.get(item.stepId)!.push(item);
  }

  return (
    <div className="container">
      <h1>{data.project.name}</h1>
      <p>
        <span className="badge info">{STATUS_LABEL[data.project.status] ?? data.project.status}</span>{' '}
        추정가격: {data.project.estimatedPrice.toLocaleString()}원 · 전체 진행률 {data.progress}%
      </p>
      <div className="progressbar" aria-label={`전체 진행률 ${data.progress}%`}><div style={{ width: `${data.progress}%` }} /></div>

      {data.steps.map((step) => {
        const items = byStep.get(step.id) ?? [];
        const doneCount = items.filter((i) => i.done).length;
        return (
          <section key={step.id} className="card">
            <h2>
              {step.label}
              {' '}
              <span className={`badge ${step.status === 'done' ? 'ok' : step.status === 'in_progress' ? 'info' : ''}`}>
                {STATUS_LABEL[step.status]} ({doneCount}/{items.length})
              </span>
            </h2>
            {items.map((item) => (
              <div key={item.id} className="check-item">
                <label>
                  <input type="checkbox" checked={item.done} onChange={(e) => void toggle(item.id, e.target.checked)} />
                  {item.label}
                </label>
              </div>
            ))}
          </section>
        );
      })}
      <p className="muted">모든 변경은 감사로그에 기록됩니다.</p>
    </div>
  );
}
