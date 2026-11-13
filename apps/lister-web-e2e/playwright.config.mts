import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { getReadyUrl, workspaceRoot } from '@nx/devkit';
import { storageStatePath } from './src/support/global-setup';

// For CI, you may want to set BASE_URL to the deployed application.
// getReadyUrl moves the address to the port the dev server task reported.
const baseURL = process.env['BASE_URL'] || getReadyUrl('http://localhost:4200');
// The production setup (lister-api:serve-prod-e2e, started by the e2e target: the API serving the
// production web build on one origin, with the service worker, on a fresh database), for
// *.pwa.spec.ts: the dev server has no service worker.
const PWA_URL = 'http://localhost:3100';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import 'dotenv/config';

/**
 * See https://playwright.dev/docs/test-configuration.
 *
 * Generated as a .mts file so Node forces ESM regardless of workspace
 * `type`. Playwright routes `.mts` through its ESM loader (dynamic import,
 * bypassing the pirates CJS-compile path), and Nx's native TS strip loads
 * `.mts` directly. Playwright's configLoader auto-discovers
 * `playwright.config.mts` via its extension list
 * (.ts/.js/.mts/.mjs/.cts/.cjs).
 */
export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: './src' }),
  // Cross-device checks wait for a round trip through the server; under the full suite's
  // parallel load that can take longer than Playwright's 5 s default.
  expect: { timeout: 10_000 },
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },
  // Signs the e2e user in through the API and stores the session cookie per project.
  globalSetup: './src/support/global-setup.ts',
  webServer: [
    {
      command: 'npx nx run lister-web:serve',
      url: getReadyUrl('http://localhost:4200'),
      reuseExistingServer: true,
      cwd: workspaceRoot,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: storageStatePath('chromium'),
      },
      testIgnore: /\.pwa\.spec\.ts$/,
    },
    {
      // *.pwa.spec.ts run against the production build (service worker active).
      name: 'pwa',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: PWA_URL,
        storageState: storageStatePath('pwa'),
      },
      testMatch: /\.pwa\.spec\.ts$/,
    },

    // Other engines: add projects here and install them (npx playwright install firefox webkit)
    /* {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    }, */

    // Uncomment for mobile browsers support
    /* {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    }, */

    // Uncomment for branded browsers
    /* {
      name: 'Microsoft Edge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
    {
      name: 'Google Chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    } */
  ],
});
