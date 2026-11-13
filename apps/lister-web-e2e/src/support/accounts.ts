import {
  type Browser,
  type Page,
  expect,
  request,
  test,
} from '@playwright/test';
import { E2E_PASSWORD, E2E_USERNAME } from './global-setup';

export { E2E_PASSWORD, E2E_USERNAME };

const stamp = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

/** A unique username: every test in a run shares the e2e database. */
export const uniqueUsername = (prefix: string) => `${prefix}-${stamp()}`;

const origin = () => test.info().project.use.baseURL as string;

/** An API client for the e2e admin, as a browser at the app's address would be (same Origin). */
async function adminApi() {
  const { storageState } = test.info().project.use;
  return request.newContext({
    baseURL: origin(),
    storageState,
    extraHTTPHeaders: { Origin: origin() },
  });
}

export interface Account {
  username: string;
  displayName: string;
  password: string;
}

/**
 * Creates an account that is ready to use: the admin creates it with a temporary password, and
 * the user changes it at once (D9). It has its own session when it signs in, so signing out never
 * affects the other specs, which share the e2e admin's session.
 */
export async function createAccount(
  prefix: string,
  options: { password?: string } = {},
): Promise<Account> {
  const username = uniqueUsername(prefix);
  const account = {
    username,
    displayName: `Test ${username}`,
    password: options.password ?? 'a-long-test-password',
  };
  const temporary = 'temporary-test-password';
  const admin = await adminApi();
  const created = await admin.post('/api/users', {
    data: {
      username,
      displayName: account.displayName,
      temporaryPassword: temporary,
    },
  });
  expect(created.status()).toBe(201);
  await admin.dispose();

  const user = await request.newContext({
    baseURL: origin(),
    extraHTTPHeaders: { Origin: origin() },
  });
  expect(
    (
      await user.post('/api/auth/login', {
        data: { username, password: temporary },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await user.post('/api/auth/password', {
        data: { currentPassword: temporary, newPassword: account.password },
      })
    ).status(),
  ).toBe(200);
  await user.dispose();
  return account;
}

/** A page of a browser that is not signed in (the project's pages share the e2e admin's session). */
export async function signedOutPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    baseURL: origin(),
    storageState: { cookies: [], origins: [] },
  });
  return context.newPage();
}

/** Signs in on the sign-in page and waits for the app. */
export async function signInThroughTheUi(
  page: Page,
  account: Pick<Account, 'username' | 'password'>,
) {
  await page.goto('/sign-in');
  await page.getByLabel('Username').fill(account.username);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/lists$/);
}
