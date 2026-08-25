import { defineConfig } from '@playwright/test';

/**
 * E2E: 웹(3000)·API(8787) 기동 후 실행.
 *   pnpm dev:api &  pnpm dev:web &
 *   pnpm test:e2e
 * 브라우저 미설치 시: npx playwright install chromium
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    locale: 'ko-KR'
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
});
