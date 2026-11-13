import { request } from '@playwright/test';
import { createAccount, signedOutPage } from './support/accounts';
import { syncStatus, synced, unique } from './support/app';
import { expect, test } from './support/fixtures';

test('signing in again in one tab resumes syncing, even when another tab does the syncing', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const account = await createAccount('two-tabs');
  const first = await signedOutPage(browser);
  await first.goto('/sign-in');
  await first.getByLabel('Username').fill(account.username);
  await first.getByLabel('Password').fill(account.password);
  await first.getByRole('button', { name: 'Sign in' }).click();
  await expect(first).toHaveURL(/\/lists$/);
  await synced(first);
  // The second tab opens later, so the first one holds the sync lock.
  const second = await first.context().newPage();
  await second.goto('/lists');
  await synced(second);

  await test.step('the session ends elsewhere (a password change ends every other session)', async () => {
    const origin = test.info().project.use.baseURL as string;
    const api = await request.newContext({
      baseURL: origin,
      extraHTTPHeaders: { Origin: origin },
    });
    await api.post('/api/auth/login', {
      data: { username: account.username, password: account.password },
    });
    const changed = await api.post('/api/auth/password', {
      data: {
        currentPassword: account.password,
        newPassword: 'another-long-test-password',
      },
    });
    expect(changed.status()).toBe(200);
    await api.dispose();
    account.password = 'another-long-test-password';
  });

  const title = unique('Written in the second tab');
  await test.step('a change in the second tab waits for sign-in', async () => {
    await second.getByRole('button', { name: 'New list' }).click();
    const dialog = second.getByRole('dialog', { name: 'New list' });
    await dialog.getByLabel('Title').fill(title);
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(second.getByRole('link', { name: title })).toBeVisible();
    await expect(syncStatus(second)).toContainText(
      'Sign in · 1 change not synced',
    );
  });

  await test.step('signing in in the second tab sends it, without touching the first', async () => {
    await second.goto('/sign-in');
    await second.getByLabel('Username').fill(account.username);
    await second.getByLabel('Password').fill(account.password);
    await second
      .getByRole('main')
      .getByRole('button', { name: 'Sign in' })
      .click();
    await expect(second).toHaveURL(/\/lists$/);
    await synced(second);
    await expect(second.getByRole('link', { name: title })).toBeVisible();
  });
  await first.context().close();
});
