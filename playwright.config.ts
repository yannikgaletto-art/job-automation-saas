import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(__dirname, 'tests/e2e-auto/.env.test') });

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const vercelBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: './tests/e2e-auto/specs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'tests/e2e-auto/playwright-report' }]],
  timeout: 120_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL,
    extraHTTPHeaders: vercelBypassSecret
      ? { 'x-vercel-protection-bypass': vercelBypassSecret }
      : undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  outputDir: 'tests/e2e-auto/test-results',
});
