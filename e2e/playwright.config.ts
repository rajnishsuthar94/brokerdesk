import { defineConfig, devices } from '@playwright/test';
import { testDatabaseUrl } from './support/test-db';

/**
 * End-to-end tests for critical user flows.
 *
 * By default Playwright starts its own API and web dev server on dedicated ports
 * (so it never touches your dev servers on 3000/4200) and points the API at the
 * disposable TEST_DATABASE_URL database (never your dev data).
 *
 * Env:
 *   E2E_BASE_URL  – test an already-running deployment instead (no servers started)
 *   E2E_CHANNEL   – use an installed browser, e.g. "msedge" or "chrome",
 *                   instead of Playwright's bundled Chromium (npx playwright install chromium)
 */
const externalBaseUrl = process.env['E2E_BASE_URL'];
const channel = process.env['E2E_CHANNEL'];
const API_PORT = Number(process.env['E2E_API_PORT'] ?? 3300);
const WEB_PORT = Number(process.env['E2E_WEB_PORT'] ?? 4400);
const webUrl = `http://localhost:${WEB_PORT}`;
/** The production build (service worker, CSP), served like nginx. */
const PROD_PORT = Number(process.env['E2E_PROD_PORT'] ?? 4500);
const prodUrl = `http://localhost:${PROD_PORT}`;

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never', outputFolder: './playwright-report' }]] : 'list',
  globalSetup: externalBaseUrl ? undefined : './support/global-setup.ts',
  use: {
    baseURL: externalBaseUrl ?? webUrl,
    trace: 'retain-on-failure',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  },
  projects: [
    { name: 'mobile', testIgnore: /prod-build\.spec\.ts/, use: { ...devices['Pixel 7'], ...(channel ? { channel } : {}) } },
    { name: 'desktop', testIgnore: /prod-build\.spec\.ts/, use: { ...devices['Desktop Chrome'], ...(channel ? { channel } : {}) } },
    // Production build: PWA (service worker, offline shell, manifest) and the CSP from security-headers.conf.
    ...(externalBaseUrl
      ? []
      : [{ name: 'prod-build', testMatch: /prod-build\.spec\.ts/, use: { ...devices['Desktop Chrome'], baseURL: prodUrl, ...(channel ? { channel } : {}) } }]),
  ],
  webServer: externalBaseUrl
    ? undefined
    : [
        {
          // Own output dir, so a developer's running `dev:api` watcher (dist/) is never disturbed.
          command: 'npm run start:e2e -w @brokerdesk/api',
          cwd: '..',
          url: `http://localhost:${API_PORT}/api/v1/health`,
          reuseExistingServer: false,
          timeout: 180_000,
          env: {
            NODE_ENV: 'development',
            PORT: String(API_PORT),
            DATABASE_URL: testDatabaseUrl(),
            APP_BASE_URL: webUrl,
            REFRESH_COOKIE_SECURE: 'false',
            MAIL_DRIVER: 'log',
            SWAGGER_ENABLED: 'false',
            // Every test logs in from the same IP.
            AUTH_THROTTLE_LIMIT: '10000',
          },
        },
        {
          command: `npm run start -w @brokerdesk/web -- --port ${WEB_PORT}`,
          cwd: '..',
          url: webUrl,
          reuseExistingServer: false,
          timeout: 180_000,
          env: { API_PROXY_TARGET: `http://localhost:${API_PORT}` },
        },
        {
          command: 'npm run build -w @brokerdesk/web && node e2e/support/prod-server.mjs',
          cwd: '..',
          url: prodUrl,
          reuseExistingServer: false,
          timeout: 300_000,
          env: { PROD_PORT: String(PROD_PORT), API_PROXY_TARGET: `http://localhost:${API_PORT}` },
        },
      ],
});
