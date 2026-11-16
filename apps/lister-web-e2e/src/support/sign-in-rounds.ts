import { type Account, createAccount, signedOutPage } from './accounts';
import { synced } from './app';
import type { Browser, Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function signIn(page: Page, account: Account) {
  await page.getByLabel('Username').fill(account.username);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/lists$/);
}

/**
 * T-052: five rounds of signing in and out must leave the app syncing every time. Pages of
 * earlier rounds (back/forward cache) must not keep the tab lock (`lister-sync`) from the next.
 * Shared by the dev spec and the production (`*.pwa`) spec.
 */
export async function signInRounds(browser: Browser) {
  test.setTimeout(180_000);
  const account: Account = await createAccount('rounds');
  const page = await signedOutPage(browser);
  await page.goto('/sign-in');

  for (let round = 1; round <= 5; round++) {
    await test.step(`round ${round}: sign in, synced`, async () => {
      await signIn(page, account);
      await synced(page);
    });
    await test.step(`round ${round}: sign out, sign-in page, no session`, async () => {
      await page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: 'Settings' })
        .click();
      await page.getByRole('button', { name: 'Sign out' }).click();
      await expect(page).toHaveURL(/\/sign-in$/);
      const me = await page.request.get('/api/auth/me');
      expect(me.status()).toBe(401);
    });
  }

  await test.step('after a reload and a second page it syncs too', async () => {
    await signIn(page, account);
    await synced(page);
    await page.reload();
    await synced(page);
    const second = await page.context().newPage();
    await second.goto('/lists');
    await synced(second);
  });

  await test.step('a fresh browser context on the same storage syncs', async () => {
    // Like closing and reopening the browser: cookies, localStorage and IndexedDB stay, the
    // pages, their lock requests and the back/forward cache are gone.
    const storageState = await page.context().storageState({ indexedDB: true });
    await page.context().close();
    const { baseURL } = test.info().project.use;
    const context = await browser.newContext({ storageState, baseURL });
    const reopened = await context.newPage();
    await reopened.goto('/lists');
    await synced(reopened);
    await context.close();
  });
}
