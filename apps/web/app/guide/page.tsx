'use client';

import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

interface WikiFile { name: string; sizeBytes: number }

export default function GuidePage() {
  const [files, setFiles] = useState<WikiFile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ files: WikiFile[] }>('/api/wiki').then((r) => setFiles(r.files)).catch(() => setFiles([]));
  }, []);

  async function open(name: string) {
    setSelected(name);
    setBusy(true);
    try {
      const r = await api<{ content: string }>(`/api/wiki/${encodeURIComponent(name)}`);
      setContent(r.content);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <h1>계약 절차와 서식 찾아보기</h1>
      <p className="muted">수집 자료 기반의 자동 정리 문서(LLMWiki)입니다. 각 문단에 원문 출처가 표시됩니다.</p>

      <div className="card">
        <h2>문서 목록</h2>
        {files.length === 0 && <p className="muted">아직 생성된 문서가 없습니다. 먼저 <code>pnpm ingest:all</code>을 실행하세요.</p>}
        <ul>
          {files.map((f) => (
            <li key={f.name}>
              <button className="btn-sm" onClick={() => void open(f.name)}>{f.name}</button>
            </li>
          ))}
        </ul>
      </div>

      {selected && (
        <div className="card">
          <h2>{selected}</h2>
          {busy ? <p className="muted">불러오는 중…</p> : (
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 14 }}>{content}</pre>
          )}
        </div>
      )}
    </div>
  );
}
