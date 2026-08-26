import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/**
 * drizzle/*.sql 마이그레이션 러너(멱등).
 * - DATABASE_URL 필수
 * - 적용 이력은 _migrations 테이블로 관리
 */
export async function runMigrations(databaseUrl: string, migrationsDir?: string): Promise<string[]> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dir = migrationsDir ?? path.resolve(here, '..', '..', '..', 'packages', 'db', 'drizzle');
  if (!fs.existsSync(dir)) throw new Error(`마이그레이션 디렉터리 없음: ${dir}`);
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const applied: string[] = [];
  try {
    await pool.query('CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const { rows } = await pool.query('SELECT name FROM _migrations');
    const done = new Set((rows as Array<{ name: string }>).map((r) => r.name));
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      if (done.has(file)) continue;
      const sqlText = fs.readFileSync(path.join(dir, file), 'utf8');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sqlText);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
  return applied;
}

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL 환경변수가 필요합니다.');
    process.exit(1);
  }
  runMigrations(url)
    .then((applied) => {
      console.log(applied.length > 0 ? `적용됨: ${applied.join(', ')}` : '새로 적용할 마이그레이션 없음');
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
