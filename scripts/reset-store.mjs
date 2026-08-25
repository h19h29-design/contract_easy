// 개발 전용: 파일스토어(data/app-store/db.json) 초기화. 운영 DB 초기화와 무관.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';

const storeDir = path.resolve('data/app-store');
const dbFile = path.join(storeDir, 'db.json');
if (!fs.existsSync(dbFile)) {
  console.log('초기화할 파일스토어가 없습니다.');
  process.exit(0);
}
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ok = await rl.question(`${dbFile} 을(를) 삭제할까요? (yes/no) `);
rl.close();
if (ok.trim().toLowerCase() !== 'yes') {
  console.log('취소했습니다.');
  process.exit(0);
}
fs.rmSync(dbFile);
console.log('파일스토어를 삭제했습니다.');
