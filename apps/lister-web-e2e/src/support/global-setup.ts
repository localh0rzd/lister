import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { workspaceRoot } from '@nx/devkit';
import { request } from '@playwright/test';

/**
 * The e2e user. These are test values for the e2e databases only (reset on every run), not
 * secrets. The first account is created with the setup token that `.env.serve-e2e` fixes.
 */
export const E2E_USERNAME = 'e2e';
export const E2E_PASSWORD = 'e2e-test-password-not-a-secret';
export const E2E_SETUP_TOKEN = 'e2e-setup-token-not-a-secret';

/** The two servers under test, and where each one's signed-in browser state is kept. */
export const E2E_SERVERS = {
  // Dev web server, proxying /api and /socket.io to the API (`lister-api:serve-e2e`).
  chromium: {
    url: 'http://localhost:4200',
    state: 'tmp/e2e/auth-chromium.json',
  },
  // The API serving the production build (`lister-api:serve-prod-e2e`).
  pwa: { url: 'http://localhost:3100', state: 'tmp/e2e/auth-pwa.json' },
} as const;

/** Where a project's signed-in state file lives (relative to the workspace root). */
export const storageStatePath = (project: keyof typeof E2E_SERVERS) =>
  join(workspaceRoot, E2E_SERVERS[project].state);

/**
 * Signs the e2e user in on each server through the API (creating it with the setup token the
 * first time) and stores the session cookie as each project's `storageState`. The sign-in screen
 * comes with T-026; until then the specs are signed in before they start.
 */
export default async function globalSetup() {
  for (const [project, server] of Object.entries(E2E_SERVERS)) {
    const api = await request.newContext({ baseURL: server.url });
    try {
      // The server's origin, as a browser at this address would send it.
      const headers = { Origin: server.url };
      let response = await api.post('/api/auth/login', {
        headers,
        data: { username: E2E_USERNAME, password: E2E_PASSWORD },
      });
      if (response.status() === 401) {
        response = await api.post('/api/auth/setup', {
          headers,
          data: {
            token: E2E_SETUP_TOKEN,
            username: E2E_USERNAME,
            displayName: 'E2E user',
            password: E2E_PASSWORD,
          },
        });
      }
      if (!response.ok()) {
        throw new Error(
          `Signing in to ${server.url} failed with ${response.status()}: ${await response.text()}`,
        );
      }
      const path = storageStatePath(project as keyof typeof E2E_SERVERS);
      mkdirSync(dirname(path), { recursive: true });
      await api.storageState({ path });
    } finally {
      await api.dispose();
    }
  }
}
