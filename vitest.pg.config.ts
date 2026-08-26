import { defineConfig } from 'vitest/config';

/**
 * PostgreSQL 통합 테스트(embedded-postgres 사용).
 * 실행: pnpm test:pg
 */
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.pg.test.ts'],
    globalSetup: './tests/pg/global-setup.ts',
    setupFiles: ['./tests/pg/setup-file.ts'],
    environment: 'node',
    testTimeout: 120000,
    hookTimeout: 180000,
    poolOptions: { threads: { singleThread: true } },
    pool: 'threads'
  }
});
