import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);

/**
 * Όλα τα tests τρέχουν σε κινητό 390×844 (85% της κίνησης έρχεται από κινητό, μέσα από το Instagram).
 * Το build γίνεται με SHOWCASE_SHOW_DRAFTS=1 ώστε να φαίνονται και τα demos πριν το Gate 3.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: true,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...devices['iPhone 13'],
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    locale: 'el-GR',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    env: { SHOWCASE_SHOW_DRAFTS: '1', NEXT_TELEMETRY_DISABLED: '1' },
  },
});
