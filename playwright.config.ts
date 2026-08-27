import { defineConfig } from '@playwright/test';

/** 브라우저 미설치 시: pnpm exec playwright install chromium */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  webServer: [
    {
      command: 'pnpm dev:api',
      url: 'http://localhost:8787/api/health',
      env: { SEN_CONTRACT_DATA_ROOT: 'tests/e2e/.data' },
      reuseExistingServer: true,
      timeout: 120000
    },
    {
      command: 'pnpm dev:web',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 120000
    }
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    locale: 'ko-KR'
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
});
