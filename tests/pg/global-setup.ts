import fs from 'node:fs';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

/**
 * Pg 통합 테스트용 임베디드 PostgreSQL 기동(vitest globalSetup).
 * - 포트 15433, DB: sen_contract_test
 * - 연결 문자열을 tests/pg/.conn.json 에 기록(setupFiles가 읽음)
 */
const CONN_FILE = path.join(__dirname, '.conn.json');
const DATA_DIR = path.join(__dirname, '.pgdata');

export default async function setup(): Promise<() => Promise<void>> {
  // 이전 실행 잔여 정리
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.rmSync(CONN_FILE, { force: true });

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: 'sen',
    password: 'password',
    port: 15433,
    persistent: false
  }) as unknown as {
    initialise: () => Promise<void>;
    start: () => Promise<void>;
    createDatabase: (name: string) => Promise<void>;
    stop: () => Promise<void>;
  };

  await pg.initialise();
  await pg.start();
  await pg.createDatabase('sen_contract_test');

  const url = 'postgres://sen:password@localhost:15433/sen_contract_test';
  fs.writeFileSync(CONN_FILE, JSON.stringify({ url }));

  return async () => {
    try { await pg.stop(); } catch { /* noop */ }
    fs.rmSync(CONN_FILE, { force: true });
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  };
}
