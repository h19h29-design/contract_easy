'use client';

import { useState } from 'react';
import { api } from '../../lib/api';

interface WizardInput {
  projectName?: string;
  workType: string;
  contractCategory: 'construction' | 'electric' | 'fire' | 'ict' | 'other';
  estimatedPrice: number;
  governmentMaterials: boolean;
  constructionWaste: boolean;
  emergency: boolean;
  regionRestriction: boolean;
  performanceRestriction: boolean;
  contractPlannedDate: string;
  completionPlannedDate: string;
  organizationType: 'school' | 'office-of-education' | 'direct-affiliate';
}

interface WizardResult {
  decisionState: 'DETERMINED' | 'REVIEW_REQUIRED' | 'PARTIAL';
  recommendedMethod?: { method: string; ruleId: string; message?: string };
  appliedRules: Array<{ id: string; status: string; summary: string }>;
  nextSteps: string[];
  documentsByStage: Array<{ stage: string; documents: string[]; sourceRuleId?: string }>;
  cautions: string[];
  evidence: Array<{ title: string; url: string; effectiveFrom?: string | null; checkedAt: string }>;
  lastCheckedAt: string;
  conflicts?: Array<{ reason: string }>;
}

const QUESTIONS = [
  { key: 'workType', label: '어떤 공사를 하려나요?', hint: '예: 학교 교실 리모델링, 운동장 포장 등', type: 'text' },
  { key: 'contractCategory', label: '건설공사인가요, 아니면 전기·소방·정보통신 공사인가요?', type: 'select', options: [
    { value: 'construction', label: '건설공사(종합/전문)' },
    { value: 'electric', label: '전기공사' },
    { value: 'fire', label: '소방공사' },
    { value: 'ict', label: '정보통신공사' },
    { value: 'other', label: '기타/잘 모르겠음' }
  ] },
  { key: 'estimatedPrice', label: '추정가격은 얼마인가요?', hint: '부가세를 제외한 금액(원)을 입력하세요. 예: 500000000', type: 'number' },
  { key: 'governmentMaterials', label: '관급자재(발주기관이 주는 자재)가 있나요?', type: 'bool' },
  { key: 'constructionWaste', label: '건설폐기물이 많이 발생하나요?', type: 'bool' },
  { key: 'emergency', label: '긴급하거나 재난과 관련된 공사인가요?', type: 'bool' },
  { key: 'regionRestriction', label: '지역 제한이 필요한가요?', type: 'bool' },
  { key: 'performanceRestriction', label: '시공 실적 제한이 필요한가요?', type: 'bool' },
  { key: 'contractPlannedDate', label: '계약 예정일은 언제인가요?', type: 'date' },
  { key: 'completionPlannedDate', label: '준공 예정일은 언제인가요?', type: 'date' },
  { key: 'organizationType', label: '발주 기관은 어디인가요?', type: 'select', options: [
    { value: 'school', label: '학교(각급 학교)' },
    { value: 'office-of-education', label: '교육지원청/교육청' },
    { value: 'direct-affiliate', label: '직속기관 산하 시설 등' }
  ] }
] as const;

export default function WizardPage() {
  const [step, setStep] = useState(0);
  const [input, setInput] = useState<WizardInput>({
    workType: '', contractCategory: 'construction', estimatedPrice: 0,
    governmentMaterials: false, constructionWaste: false, emergency: false,
    regionRestriction: false, performanceRestriction: false,
    contractPlannedDate: '', completionPlannedDate: '', organizationType: 'school'
  });
  const [result, setResult] = useState<WizardResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const total = QUESTIONS.length + 1;
  const done = step >= QUESTIONS.length;

  const update = (key: keyof WizardInput, value: unknown) =>
    setInput((p) => ({ ...p, [key]: value }));

  async function submit() {
    setBusy(true);
    setError('');
    try {
      const res = await api<WizardResult>('/api/wizard', {
        json: {
          ...input,
          estimatedPrice: Number(input.estimatedPrice) || 0,
          contractPlannedDate: input.contractPlannedDate || null,
          completionPlannedDate: input.completionPlannedDate || null
        }
      });
      setResult(res);
      setStep(total);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="wizard-progress" aria-hidden>
        {Array.from({ length: total }).map((_, i) => (
          <span key={i} className={`dot ${i <= step ? 'on' : ''}`} />
        ))}
      </div>
      <h1>새 공사계약 안내</h1>

      {!done && (
        <section className="card" aria-live="polite">
          <h2>{step + 1}. {QUESTIONS[step].label}</h2>
          {'hint' in QUESTIONS[step] && QUESTIONS[step].hint ? (
            <p className="muted">{QUESTIONS[step].hint}</p>
          ) : null}
          <QuestionField
            q={QUESTIONS[step]}
            input={input}
            onChange={(k, v) => update(k as keyof WizardInput, v)}
            onEnter={() => (step < QUESTIONS.length - 1 ? setStep(step + 1) : submit())}
          />
          <div className="row-actions">
            {step > 0 && <button onClick={() => setStep(step - 1)}>이전</button>}
            {step < QUESTIONS.length - 1
              ? <button className="btn-primary" onClick={() => setStep(step + 1)}>다음</button>
              : <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? '확인 중...' : '결과 보기'}</button>}
          </div>
          {error && <p className="badge danger">{error}</p>}
        </section>
      )}

      {result && <ResultView result={result} onRestart={() => { setResult(null); setStep(0); }} />}
    </div>
  );
}

function QuestionField({ q, input, onChange, onEnter }: {
  q: (typeof QUESTIONS)[number];
  input: WizardInput;
  onChange: (key: string, v: unknown) => void;
  onEnter: () => void;
}) {
  if (q.type === 'bool') {
    return (
      <div role="radiogroup" aria-label={q.label}>
        <label className="check-item"><input type="checkbox" checked={Boolean(input[q.key as keyof WizardInput])} onChange={(e) => onChange(q.key, e.target.checked)} /> 예</label>
        <label className="check-item"><input type="checkbox" checked={!input[q.key as keyof WizardInput]} onChange={(e) => onChange(q.key, !e.target.checked)} /> 아니오</label>
      </div>
    );
  }
  if (q.type === 'select') {
    return (
      <select aria-label={q.label} value={String(input[q.key as keyof WizardInput])} onChange={(e) => onChange(q.key, e.target.value)}>
        {q.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  return (
    <input
      aria-label={q.label}
      type={q.type === 'number' ? 'number' : q.type === 'date' ? 'date' : 'text'}
      value={String(input[q.key as keyof WizardInput] ?? '')}
      onKeyDown={(e) => { if (e.key === 'Enter') onEnter(); }}
      onChange={(e) => onChange(q.key, q.type === 'number' ? Number(e.target.value) : e.target.value)}
    />
  );
}

function ResultView({ result, onRestart }: { result: WizardResult; onRestart: () => void }) {
  const reviewRequired = result.decisionState === 'REVIEW_REQUIRED';
  return (
    <section className="card">
      <h2>결과</h2>
      <p>
        {reviewRequired
          ? <span className="badge review">담당자 검토 필요</span>
          : <span className="badge ok">규칙 판정 완료</span>}
      </p>

      {reviewRequired ? (
        <div className="notice-review">
          현재 활성화된 검토 규칙이 없습니다.
          원문 자료를 확인한 뒤 관리자 승인이 필요합니다.
          구체적인 계약방법·금액 기준은 추측하여 제공하지 않습니다.
        </div>
      ) : (
        <div className="notice-ai">
          <strong>[규칙 판정]</strong> 추천 계약방법: {result.recommendedMethod?.method}
          <br /><small>적용 규칙: {result.recommendedMethod?.ruleId}</small>
        </div>
      )}

      {result.conflicts && result.conflicts.length > 0 && (
        <div className="notice-review">⚠️ 활성 규칙 간 충돌이 감지되었습니다. 관리자 확인이 필요합니다.</div>
      )}

      <h3>다음에 할 일</h3>
      {result.nextSteps.length === 0
        ? <p className="muted">승인된 규칙이 없어 자동 산출 항목이 없습니다. 담당자 확인 후 진행하세요.</p>
        : <ol>{result.nextSteps.map((s, i) => <li key={i}>{s}</li>)}</ol>}

      <h3>단계별 필요서류</h3>
      {result.documentsByStage.length === 0
        ? <p className="muted">승인된 규칙 기반 서류 목록이 아직 없습니다.</p>
        : <ul>{result.documentsByStage.map((d) => <li key={d.stage}><strong>{d.stage}</strong>: {d.documents.join(', ')}</li>)}</ul>}

      <h3>주의사항</h3>
      <ul>{result.cautions.map((c, i) => <li key={i}>{c}</li>)}</ul>

      <details open>
        <summary><strong>원문 근거 ({result.evidence.length})</strong></summary>
        {result.evidence.length === 0 && <p className="muted">근거로 연결된 승인 규칙이 없습니다.</p>}
        {result.evidence.map((e, i) => (
          <details key={i} className="source-card">
            <summary>{e.title || '(제목없음)'}</summary>
            <div className="source-meta">
              URL: <a href={e.url} target="_blank" rel="noreferrer noopener">{e.url}</a><br />
              시행일: {e.effectiveFrom ?? '미확인'} · 마지막 확인일: {e.checkedAt?.slice(0, 10)}
            </div>
          </details>
        ))}
      </details>

      <p className="muted">마지막 확인일: {result.lastCheckedAt.slice(0, 10)}</p>
      <button onClick={onRestart}>처음부터 다시</button>
    </section>
  );
}
