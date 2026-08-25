'use client';

import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

interface SourceRow {
  id: string;
  url: string;
  kind: string;
  seedName: string | null;
  status: string;
  versionCount: number;
  title?: string;
  collectedAt?: string;
  lastCheckedAt?: string;
  attachments: Array<{ fileName: string; ext: string; robotsDisallowed: boolean }>;
}

export default function SourcesPage() {
  const [rows, setRows] = useState<SourceRow[]>([]);

  useEffect(() => {
    api<{ sources: SourceRow[] }>('/api/sources').then((r) => setRows(r.sources)).catch(() => setRows([]));
  }, []);

  return (
    <div className="container">
      <h1>출처(원문) 목록</h1>
      <p className="muted">
        모든 안내·답변의 근거가 되는 수집 원문입니다. 원본은 SHA-256 해시로 버전 관리됩니다.
        첨부파일은 robots.txt 정책상 메타데이터만 보관합니다.
      </p>

      <div className="card" style={{ overflowX: 'auto' }}>
        {rows.length === 0
          ? <p className="muted">수집된 자료가 없습니다. `pnpm crawl:sample` 또는 `pnpm crawl:full` 실행 후 확인하세요.</p>
          : (
            <table className="data">
              <thead>
                <tr><th>제목</th><th>분류</th><th>버전</th><th>상태</th><th>마지막 확인</th><th>첨부</th><th>URL</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.title ?? '-'}</td>
                    <td>{r.seedName ?? r.kind}</td>
                    <td>{r.versionCount}</td>
                    <td>{r.status === 'active' ? <span className="badge ok">활성</span> : <span className="badge review">비활성</span>}</td>
                    <td>{r.lastCheckedAt?.slice(0, 10)}</td>
                    <td>{r.attachments.length}건 (메타)</td>
                    <td><a href={r.url} target="_blank" rel="noreferrer noopener">열기</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}
