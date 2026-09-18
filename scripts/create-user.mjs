import path from 'node:path';
import fs from 'node:fs';

/**
 * 운영 사용자 생성 일회성 스크립트 — 관리자 API가 없어 PgStore로 직접 생성한다.
 * 시크릿 정책: 비밀번호는 파일로만 전달(커맨드라인 인자 금지).
 *
 * 환경변수:
 *   NEW_USERNAME   (필수) 생성할 사용자명
 *   NEW_ROLE       (필수) USER | REVIEWER | ADMIN
 *   NEW_DISPLAY    (선택) 표시 이름
 *   NEW_PASSWORD_FILE (필수) 비밀번호가 담긴 파일 경로(내용 전체가 비밀번호)
 *   DATABASE_URL   (필수) PG 접속 문자열 — 컨테이너 env-file로 주입
 *   SEN_DB_DIST    (선택) @sen/db dist index.js 경로. 기본: packages/db/dist/index.js
 *
 * 사용(NAS): docker run --rm --network sen-contract-guide_default \
 *   --env-file contract_easy.env \
 *   -e NEW_USERNAME=reviewer -e NEW_ROLE=REVIEWER -e NEW_PASSWORD_FILE=/secrets/pw \
 *   -v /path/staging:/secrets:ro sen-contract-guide-crawler:latest \
 *   node /secrets/create-user.mjs
 */

const username = process.env.NEW_USERNAME?.trim();
const role = process.env.NEW_ROLE?.trim();
const pwFile = process.env.NEW_PASSWORD_FILE?.trim();
const display = process.env.NEW_DISPLAY?.trim() || username;
const dbDist = process.env.SEN_DB_DIST ?? path.resolve('packages/db/dist/index.js');

if (!username || !role || !pwFile || !process.env.DATABASE_URL) {
  console.error('[create-user] NEW_USERNAME, NEW_ROLE, NEW_PASSWORD_FILE, DATABASE_URL 필요');
  process.exit(1);
}
if (!['USER', 'REVIEWER', 'ADMIN'].includes(role)) {
  console.error('[create-user] NEW_ROLE은 USER|REVIEWER|ADMIN 중 하나');
  process.exit(1);
}
const password = fs.readFileSync(pwFile, 'utf8').trim();
if (password.length < 8) {
  console.error('[create-user] 비밀번호는 8자 이상이어야 합니다.');
  process.exit(1);
}

const { PgStore, hashPassword } = await import(dbDist);
const pg = await PgStore.connectWithMigrations(
  process.env.DATABASE_URL,
  path.resolve('packages/db/drizzle')
);

const existing = await pg.getUserByUsername(username);
if (existing) {
  console.log(`[create-user] ${username} 이미 존재(role=${existing.role}) — 변경하지 않음`);
  process.exit(0);
}
const user = await pg.createUser({
  username,
  passwordHash: hashPassword(password),
  displayName: display,
  role
});
console.log(`[create-user] 생성 완료: ${user.username} role=${user.role}`);
process.exit(0);
