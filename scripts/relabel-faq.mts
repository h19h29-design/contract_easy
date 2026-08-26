import path from 'node:path';
import { FileStore } from '../packages/db/src/index.js';

/** 원클릭 FAQ(sn=1412) 문서의 라벨을 중립 라벨로 교정 */
const store = new FileStore(path.resolve('data/app-store'));
let fixed = 0;
for (const src of await store.listSources()) {
  if (src.kind !== 'external-faq-detail') continue;
  const v = src.versions[src.versions.length - 1];
  if (!v) continue;
  if ((v.menuPath ?? [])[0] === 'FAQ-공사') {
    v.menuPath = ['FAQ-원클릭'];
    v.lastCheckedAt = new Date().toISOString();
    fixed++;
  }
}
// flush 트리거: 더미 upsert 대신 파일 재직렬화를 위해 내부 flush 호출
(store as unknown as { flush(): void }).flush();
console.log(`relabeled ${fixed} docs → FAQ-원클릭`);
