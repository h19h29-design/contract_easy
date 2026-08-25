'use client';

import { useState } from 'react';
import { api } from '../../lib/api';

interface SearchHit {
  chunkId: string;
  title: string;
  url: string;
  snippet: string;
  sectionPath: string[];
  type: string;
  publishedAt?: string | null;
  effectiveAt?: string | null;
}

interface AskResponse {
  answered: boolean;
  answer?: string;
  refusalReason?: string;
  providerNotice?: string;
  evidence?: Array<{ title: string; url: string; publishedAt?: string | null; effectiveAt?: string | null }>;
  keywordHits?: Array<{ title: string; url: string }>;
  disclaimer?: string;
}

const TYPE_LABELS: Record<string, string> = {
  heading: '제목', paragraph: '본문', 'table-row': '표',
  faq: 'FAQ', form: '서식', 'rule-source': '규칙근거', 'legal-reference': '법령'
};

export default function SearchPage() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [ask, setAsk] = useState<AskResponse | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!q.trim()) return;
    setBusy(true);
    try {
      const search = await api<{ hits: SearchHit[] }>(`/api/search?q=${encodeURIComponent(q)}`);
      setHits(search.hits);
      const askRes = await api<AskResponse>('/api/ask', { json: { question: q } });
      setAsk(askRes);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <h1>계약업무 통합검색</h1>
      <p className="muted">수집된 공식 자료(계약길잡이·공지·FAQ 등)에서 검색합니다.</p>

      <section className="card">
        <label className="field" htmlFor="search-q">검색어</label>
        <input
          id="search-q"
          type="text"
          placeholder="예: 계약보증금, 수의계약, 하자보증기간"
          value={q}
          onKeyDown={(e) => { if (e.key === 'Enter') void run(); }}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="row-actions">
          <button className="btn-primary" onClick={() => void run()} disabled={busy}>{busy ? '검색 중...' : '검색'}</button>
        </div>
      </section>

      {ask && (
        <section className="card">
          <h2>출처 기반 답변</h2>
          {ask.answered ? (
            <>
              <p style={{ whiteSpace: 'pre-line' }}><span className="badge info">AI 설명</span><br />{ask.answer}</p>
              <p className="muted">{ask.disclaimer}</p>
              {(ask.evidence ?? []).map((e, i) => (
                <details key={i} className="source-card">
                  <summary>{e.title || '(제목없음)'}</summary>
                  <div className="source-meta">
                    URL: <a href={e.url} target="_blank" rel="noreferrer noopener">{e.url}</a><br />
                    게시일/시행일: {e.publishedAt ?? e.effectiveAt ?? '미확인'}
                  </div>
                </details>
              ))}
            </>
          ) : (
            <>
              {ask.refusalReason && <div className="notice-review">{ask.refusalReason}</div>}
              {ask.providerNotice && <div className="notice-ai">{ask.providerNotice}</div>}
              {ask.keywordHits && ask.keywordHits.length > 0 && (
                <>
                  <h3>키워드 검색 결과</h3>
                  {ask.keywordHits.map((h, i) => (
                    <a key={i} href={h.url} target="_blank" rel="noreferrer noopener" className="source-card" style={{ display: 'block', color: 'inherit' }}>
                      {h.title}
                    </a>
                  ))}
                </>
              )}
            </>
          )}
        </section>
      )}

      {hits !== null && (
        <section className="card">
          <h2>검색 결과 ({hits.length})</h2>
          {hits.length === 0 && <p className="muted">결과가 없습니다. 다른 검색어로 시도해 보세요.</p>}
          {hits.map((h) => (
            <article key={h.chunkId} className="source-card">
              <summary style={{ fontWeight: 600 }}>{h.title}</summary>
              <p style={{ margin: '6px 0' }}>{h.snippet}{h.snippet.length >= 300 ? '…' : ''}</p>
              <div className="source-meta">
                <span className="badge info">{TYPE_LABELS[h.type] ?? h.type}</span>{' '}
                {h.sectionPath.join(' › ') && `${h.sectionPath.join(' › ')} · `}
                <a href={h.url} target="_blank" rel="noreferrer noopener">원문 열기</a>
                {h.publishedAt ? ` · 게시일 ${h.publishedAt}` : ''}
                {h.effectiveAt ? ` · 시행일 ${h.effectiveAt}` : ''}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
