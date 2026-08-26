import fs from 'node:fs';
import path from 'node:path';

/** globalSetup이 기록한 연결 정보를 테스트 워커 env에 주입 */
const connFile = path.join(__dirname, '.conn.json');
if (!fs.existsSync(connFile)) {
  throw new Error('.conn.json 없음 — vitest.pg.config.ts의 globalSetup을 통해 실행해야 합니다.');
}
const { url } = JSON.parse(fs.readFileSync(connFile, 'utf8')) as { url: string };
process.env.PG_TEST_URL = url;
