import { type Account, createAccount, signedOutPage } from './accounts';
import { synced } from './app';
import type { Browser } from '@playwright/test';
import { expect, test } from './fixtures';

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
      await page.getByLabel('Username').fill(account.username);
      await page.getByLabel('Password').fill(account.password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page).toHaveURL(/\/lists$/);
      await synced(page);
    });
    await test.step(`round ${round}: sign out, sign-in page, no session`, async () => {
      await page.getByRole('link', { name: 'Space' }).click();
      await page.getByRole('link', { name: /Profile/ }).click();
      await page.getByRole('button', { name: 'Sign out' }).click();
      await expect(page).toHaveURL(/\/sign-in$/);
      const me = await page.request.get('/api/auth/me');
      expect(me.status()).toBe(401);
    });
  }

  await test.step('a fresh page on the same storage syncs too', async () => {
    await page.getByLabel('Username').fill(account.username);
    await page.getByLabel('Password').fill(account.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/lists$/);
    const second = await page.context().newPage();
    await second.goto('/lists');
    await synced(second);
  });
  await page.context().close();
}
