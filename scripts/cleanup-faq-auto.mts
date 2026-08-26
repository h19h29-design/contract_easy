import fs from 'node:fs';
import path from 'node:path';
import { FileStore } from '../packages/db/src/index.js';

/**
 * 일회성 정리: 오판으로 수집한 FAQ-auto-* 게시판 문서 제거.
 * (부서업무방 공지/사전정보공표 게시판이 FAQ로 잘못 확장됨)
 */
const store = new FileStore(path.resolve('data/app-store'));
let removed = 0;
for (const src of await store.listSources()) {
  const label = src.versions[src.versions.length - 1]?.menuPath?.[0] ?? '';
  if (src.kind === 'external-faq-detail' && label.startsWith('FAQ-auto')) {
    if (store.removeSource(src.id)) removed++;
  }
}
console.log(`removed ${removed} mis-scoped external-faq sources`);
void fs;
