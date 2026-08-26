import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from '@sen/config';
import { FileStore } from './store.js';
import { PgStore } from './pg-store.js';
import type { AppStore } from './app-store.js';

/**
 * DATABASE_URL이 있으면 PgStore(PostgreSQL), 없으면 FileStore(파일)를 반환한다.
 * PgStore 연결 시 drizzle/*.sql 마이그레이션을 자동 적용(멱등)한다.
 */
export async function createStore(opts?: { databaseUrl?: string | null; appStoreDir?: string }): Promise<AppStore> {
  const cfg = opts?.databaseUrl === undefined ? getConfig() : null;
  const databaseUrl = opts?.databaseUrl ?? cfg?.databaseUrl ?? null;
  const appStoreDir = opts?.appStoreDir ?? (await import('@sen/config')).ensureDirs().appStore;

  if (databaseUrl) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const migrationsDir = path.resolve(here, '..', 'drizzle');
    return PgStore.connectWithMigrations(databaseUrl, migrationsDir);
  }
  return new FileStore(appStoreDir);
}
