import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for Market-Ready E2E Tests
 *
 * Tests 6 critical user journeys to prove market readiness:
 * 1. Auth: register/login/refresh/revocation
 * 2. Listing: draft -> publish (NYC compliance gate)
 * 3. Application: prequal -> conditional offer -> background check (FCHA)
 * 4. Vault: upload doc -> ACL -> signed URL
 * 5. Revenue: partner-attributed transaction -> ledger
 * 6. 3D Tour: listing with tour -> signed URL -> viewer
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: [
    ['html', { outputFolder: 'tests/e2e/reports/html' }],
    ['json', { outputFile: 'tests/e2e/reports/results.json' }],
    ['junit', { outputFile: 'tests/e2e/reports/junit.xml' }],
    ['./tests/e2e/reporters/market-ready-reporter.ts'],
  ],
  outputDir: 'tests/e2e/test-results',

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'api',
      testMatch: /.*\.api\.spec\.ts/,
      use: {
        baseURL: process.env.E2E_API_URL || 'http://localhost:4000',
      },
    },
  ],

  webServer: process.env.CI
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
      },

  // Global setup/teardown for test isolation
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
});
