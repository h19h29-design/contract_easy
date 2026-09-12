'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
// Direct browser-safe module: do not import the Node-dependent shared barrel.
import { CONTRACT_FORMS, contractFormFields, contractMissingFields, isContractFormKind, type ContractDraft, type ContractFields, type ContractFieldKey } from '@sen/shared/src/contract';
import { api, API_URL } from '../../../../../lib/api';

export default function ContractPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const formQuery = useSearchParams().get('form');
  const form = isContractFormKind(formQuery) ? formQuery : 'contract';
  const definition = CONTRACT_FORMS[form];
  const fieldDefs = contractFormFields(form);
  const requiredKeys: readonly ContractFieldKey[] = definition.requiredKeys;
  const reviewKeys: readonly ContractFieldKey[] = definition.reviewKeys;
  const [fields, setFields] = useState<ContractFields | null>(null);
  const [saved, setSaved] = useState<ContractDraft | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [preview, setPreview] = useState(false);
  const dirty = fields !== null && JSON.stringify(fields) !== JSON.stringify(saved?.fields);

  useEffect(() => { setReviewed(false); }, [form]);

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
      const response = await fetch(`${API_URL}/api/projects/${id}/contract.hwpx?revision=${saved.revision}&reviewed=true&form=${form}`, { credentials: 'include', cache: 'no-store' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? '다운로드에 실패했습니다.');
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a'); anchor.href = url;
      anchor.download = `${definition.label}-초안-v${saved.revision}.hwpx`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  const groups = [...new Set(fieldDefs.map(([, , group]) => group))];
  const missing = fields ? contractMissingFields(fields, form) : [];
  const legalMissing = fields ? fieldDefs.filter(([key]) => reviewKeys.includes(key) && !fields[key]).map(([, label]) => label) : [];

  return <div className="container">
    <Link href={`/workspace/projects/${id}`} onClick={(event) => { if (dirty && !window.confirm('저장하지 않은 입력이 있습니다. 나가시겠습니까?')) event.preventDefault(); }}>← 프로젝트로</Link>
    <h1>{definition.label} 작성</h1>
    <p>정보를 입력하고 초안을 저장한 뒤, 한글에서 편집할 수 있는 HWPX를 내려받으세요.</p>
    {error && <div role="alert" className="notice-review">{error} <Link href="/workspace">업무공간</Link></div>}
    {!fields ? <p>{error ? '입력 화면을 불러오지 못했습니다.' : '초안을 불러오는 중…'}</p> : <>
      <div className="notice-review">시험 작성 기능입니다. 원본 항목을 바탕으로 재구성한 초안이며 원본 엑셀의 인쇄 배치와 동일하지 않습니다. 한글에서 실제 열기·편집·인쇄 배치는 아직 검증 전입니다. 금액·비율·기간의 적법성을 자동 판단하지 않습니다.</div>
      <section className="card">
        <label className="field" htmlFor="contract-form"><span>작성할 서식</span><select id="contract-form" value={form} disabled={busy} onChange={(event) => {
          const next = event.target.value;
          if (!isContractFormKind(next)) return;
          setReviewed(false);
          router.replace(`/workspace/projects/${id}/contract?form=${next}`, { scroll: false });
        }}>{Object.entries(CONTRACT_FORMS).map(([key, value]) => <option value={key} key={key}>{value.label}</option>)}</select></label>
        <p className="muted">공사명·기관·업체 등 공통정보는 서식 간 함께 사용합니다. 서식을 바꿔도 입력은 유지되며 저장 시 전체 입력의 새 버전이 만들어집니다.</p>
        <p data-testid="contract-save-status" role="status">{saved ? `저장된 버전: ${saved.revision}` : '아직 저장하지 않았습니다.'}{dirty ? ' · 저장하지 않은 입력 있음' : ' · 저장 완료'}</p>
        <div className="row-actions">
          <button className="btn-primary" disabled={busy || !dirty} onClick={() => void save()}>초안 저장</button>
          <button aria-pressed={!preview} onClick={() => setPreview(false)}>입력</button>
          <button aria-pressed={preview} onClick={() => setPreview(true)}>미리보기</button>
        </div>
        <p className="muted">개인별 작성 내용은 공개 검색에 포함되지 않습니다. 저장 버전은 보존되며 계약 체결·승인을 의미하지 않습니다.</p>
      </section>
      {form !== 'contract' && <p className="notice-review">실제 착공일·준공일·제출일과 수신인 직위는 직접 확인해 입력하세요. 문서 다운로드로 실제 제출이나 프로젝트 단계 변경이 이루어지지 않습니다.</p>}
      {form === 'payment' && <p className="notice-review">준공금액·기지급액·청구금액·공제금액은 자동 산출하지 않습니다. 정산 결과를 확인해 직접 입력하고, 해당 금액이 없으면 0을 명시하세요. 계좌정보는 대금청구서에만 출력되며 실제 이체는 하지 않습니다.</p>}
      {!preview ? <div>
        {groups.map((group) => <fieldset className="card" disabled={busy} key={group}>
          <legend><h2>{group}</h2></legend>
          {group === '담당자 확인 항목' && <p className="muted">원문을 대조한 담당자가 직접 입력하세요. 비어 있으면 문서에 [검토 필요]가 표시됩니다.</p>}
          {group === '하자담보책임' && <p className="muted">첫 버전은 공종 1행을 지원합니다. 복합공종은 내려받은 HWPX에서 공종별 행을 추가하세요.</p>}
          {group === '착공 신고' && <p className="muted">현장대리인계·예정공정표·도급내역서는 자동 생성되지 않습니다. 직접 준비한 붙임 목록을 입력하세요.</p>}
          <div className="form-grid">{fieldDefs.filter(([, , g]) => g === group).map(([key, label, , type]) => {
            const required = requiredKeys.includes(key);
            return <label className="field" key={key} htmlFor={`contract-${key}`}>
            <span>{label}{required ? ' *' : ''}</span>
            {type === 'multiline'
              ? <textarea id={`contract-${key}`} aria-label={label} maxLength={3000} value={fields[key]} onChange={(e) => update(key, e.target.value)} rows={4} />
              : <input id={`contract-${key}`} aria-label={label} aria-required={required} type={type === 'date' ? 'date' : 'text'} inputMode={type === 'amount' ? 'numeric' : undefined} maxLength={type === 'amount' ? 30 : 300} value={fields[key]} onChange={(e) => update(key, e.target.value)} autoComplete="off" />}
            {type === 'amount' && <small>쉼표 없이 원 단위 입력. 다른 금액에서 자동 계산하거나 복사하지 않습니다.</small>}
            {key === 'startDate' && <small>계약서의 착공 예정일입니다. 착공계의 실제 착공일은 별도로 입력합니다.</small>}
            {key === 'endDate' && <small>계약상 준공기한입니다. 실제 준공일과 구분합니다.</small>}
          </label>; })}</div>
        </fieldset>)}
      </div> : <section className="card contract-preview" data-testid="contract-preview">
        <h2>{definition.label} · 초안</h2>
        <p className="muted">입력 항목 확인용 미리보기입니다. HWPX의 실제 페이지 나눔은 한글에서 확인하세요.</p>
        {groups.map((group) => <div key={group}><h3>{group}</h3><dl>{fieldDefs.filter(([, , g]) => g === group).map(([key, label]) => <div className="contract-preview-row" key={key}><dt>{label}</dt><dd>{fields[key] || (reviewKeys.includes(key) ? '[검토 필요]' : '[미입력]')}</dd></div>)}</dl></div>)}
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
