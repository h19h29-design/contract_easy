'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
// Direct browser-safe module: do not import the Node-dependent shared barrel.
import { CONTRACT_FIELD_DEFS, CONTRACT_REVIEW_KEYS, contractMissingFields, type ContractDraft, type ContractFields, type ContractFieldKey } from '@sen/shared/src/contract';
import { api, API_URL } from '../../../../../lib/api';

export default function ContractPage() {
  const { id } = useParams<{ id: string }>();
  const [fields, setFields] = useState<ContractFields | null>(null);
  const [saved, setSaved] = useState<ContractDraft | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [preview, setPreview] = useState(false);
  const dirty = fields !== null && JSON.stringify(fields) !== JSON.stringify(saved?.fields);

  useEffect(() => {
    let active = true;
    setFields(null); setSaved(null); setError(''); setReviewed(false); setPreview(false);
    api<{ draft: ContractDraft | null; initialFields: ContractFields }>(`/api/projects/${id}/contract`)
      .then((data) => { if (active) { setSaved(data.draft); setFields(data.draft?.fields ?? data.initialFields); } })
      .catch((e: Error) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);

  function update(key: ContractFieldKey, value: string) {
    setFields((current) => current ? { ...current, [key]: value } : null);
    setReviewed(false);
  }

  async function save() {
    setBusy(true); setError(''); setReviewed(false);
    try {
      const result = await api<{ draft: ContractDraft }>(`/api/projects/${id}/contract`, { method: 'PUT', json: { fields, expectedRevision: saved?.revision ?? 0 } });
      setSaved(result.draft); setFields(result.draft.fields);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function download() {
    if (!saved || dirty || !reviewed) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`${API_URL}/api/projects/${id}/contract.hwpx?revision=${saved.revision}&reviewed=true`, { credentials: 'include', cache: 'no-store' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? '다운로드에 실패했습니다.');
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a'); anchor.href = url;
      anchor.download = `공사표준계약서-초안-v${saved.revision}.hwpx`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  const groups = [...new Set(CONTRACT_FIELD_DEFS.map(([, , group]) => group))];
  const missing = fields ? contractMissingFields(fields) : [];
  const legalMissing = fields ? CONTRACT_FIELD_DEFS.filter(([key]) => CONTRACT_REVIEW_KEYS.includes(key) && !fields[key]).map(([, label]) => label) : [];

  return <div className="container">
    <Link href={`/workspace/projects/${id}`} onClick={(event) => { if (dirty && !window.confirm('저장하지 않은 입력이 있습니다. 나가시겠습니까?')) event.preventDefault(); }}>← 프로젝트로</Link>
    <h1>공사표준계약서 작성</h1>
    <p>정보를 입력하고 초안을 저장한 뒤, 한글에서 편집할 수 있는 HWPX를 내려받으세요.</p>
    {error && <div role="alert" className="notice-review">{error} <Link href="/workspace">업무공간</Link></div>}
    {!fields ? <p>{error ? '입력 화면을 불러오지 못했습니다.' : '초안을 불러오는 중…'}</p> : <>
      <div className="notice-review">시험 작성 기능입니다. 원본 항목을 바탕으로 재구성한 초안이며 원본 엑셀의 인쇄 배치와 동일하지 않습니다. 한글에서 실제 열기·편집·인쇄 배치는 아직 검증 전입니다. 금액·비율·기간의 적법성을 자동 판단하지 않습니다.</div>
      <section className="card">
        <p data-testid="contract-save-status" role="status">{saved ? `저장된 버전: ${saved.revision}` : '아직 저장하지 않았습니다.'}{dirty ? ' · 저장하지 않은 입력 있음' : ' · 저장 완료'}</p>
        <div className="row-actions">
          <button className="btn-primary" disabled={busy || !dirty} onClick={() => void save()}>초안 저장</button>
          <button aria-pressed={!preview} onClick={() => setPreview(false)}>입력</button>
          <button aria-pressed={preview} onClick={() => setPreview(true)}>미리보기</button>
        </div>
        <p className="muted">개인별 작성 내용은 공개 검색에 포함되지 않습니다. 저장 버전은 보존되며 계약 체결·승인을 의미하지 않습니다.</p>
      </section>
      {!preview ? <div>
        {groups.map((group) => <fieldset className="card" disabled={busy} key={group}>
          <legend><h2>{group}</h2></legend>
          {group === '담당자 확인 항목' && <p className="muted">원문을 대조한 담당자가 직접 입력하세요. 비어 있으면 문서에 [검토 필요]가 표시됩니다.</p>}
          {group === '하자담보책임' && <p className="muted">첫 버전은 공종 1행을 지원합니다. 복합공종은 내려받은 HWPX에서 공종별 행을 추가하세요.</p>}
          <div className="form-grid">{CONTRACT_FIELD_DEFS.filter(([, , g]) => g === group).map(([key, label, , type, required]) => <label className="field" key={key} htmlFor={`contract-${key}`}>
            <span>{label}{required ? ' *' : ''}</span>
            {type === 'multiline'
              ? <textarea id={`contract-${key}`} aria-label={label} maxLength={3000} value={fields[key]} onChange={(e) => update(key, e.target.value)} rows={4} />
              : <input id={`contract-${key}`} aria-label={label} aria-required={required} type={type === 'date' ? 'date' : 'text'} inputMode={type === 'amount' ? 'numeric' : undefined} maxLength={type === 'amount' ? 30 : 300} value={fields[key]} onChange={(e) => update(key, e.target.value)} autoComplete="off" />}
            {type === 'amount' && <small>쉼표 없이 원 단위 입력. 추정가격을 계약금액으로 자동 복사하지 않습니다.</small>}
          </label>)}</div>
        </fieldset>)}
      </div> : <section className="card contract-preview" data-testid="contract-preview">
        <h2>공사도급표준계약서 · 초안</h2>
        <p className="muted">입력 항목 확인용 미리보기입니다. HWPX의 실제 페이지 나눔은 한글에서 확인하세요.</p>
        {groups.map((group) => <div key={group}><h3>{group}</h3><dl>{CONTRACT_FIELD_DEFS.filter(([, , g]) => g === group).map(([key, label]) => <div className="contract-preview-row" key={key}><dt>{label}</dt><dd>{fields[key] || (CONTRACT_REVIEW_KEYS.includes(key) ? '[검토 필요]' : '[미입력]')}</dd></div>)}</dl></div>)}
      </section>}
      <section className="card">
        <h2>HWPX 다운로드</h2>
        {missing.length > 0 && <p>필수 입력: {missing.join(', ')}</p>}
        {legalMissing.length > 0 && <p className="notice-review">검토 필요: {legalMissing.join(', ')}</p>}
        <label className="check-item"><input type="checkbox" checked={reviewed} disabled={!saved || dirty || busy || missing.length > 0} onChange={(e) => setReviewed(e.target.checked)} />검토 필요 항목을 확인했으며 이 문서는 초안임을 이해합니다.</label>
        <button className="btn-primary" disabled={!saved || dirty || busy || missing.length > 0 || !reviewed} onClick={() => void download()}>HWPX 다운로드</button>
        <p className="muted">저장 후 다운로드할 수 있습니다. 붙임서류는 목록만 기재되며 실제 파일·인감은 포함되지 않습니다.</p>
      </section>
    </>}
  </div>;
}
