import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:8788',
    browserName: 'chromium',
    channel: process.platform === 'win32' ? 'chrome' : undefined,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev:pages',
    url: 'http://127.0.0.1:8788/api/health',
    timeout: 45_000,
    reuseExistingServer: !process.env.CI,
  },
});
