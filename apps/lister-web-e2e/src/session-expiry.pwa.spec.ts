import { createAccount, signedOutPage } from './support/accounts';
import { createList, shellIsCached, syncStatus, synced } from './support/app';
import { expect, test } from './support/fixtures';

test.describe('a session that ends', () => {
  test('keeps the app working and the pending changes, asks to sign in, and syncs them after signing in', async ({
    browser,
    expectAccessible,
  }) => {
    test.setTimeout(120_000);
    const account = await createAccount('expiry');
    const page = await signedOutPage(browser);
    await page.goto('/sign-in');
    await page.getByLabel('Username').fill(account.username);
    await page.getByLabel('Password').fill(account.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/lists$/);
    await synced(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect
      .poll(() => shellIsCached(page), { timeout: 60_000 })
      .toBe(true);

    await test.step('offline, the session ends and a change is made', async () => {
      await page.context().setOffline(true);
      await expect(syncStatus(page)).toContainText('Offline');
      await page.context().clearCookies();
    });
    const title = await createList(
      page,
      `Written while signed out ${Date.now()}`,
    );

    await test.step('back online the app asks for sign-in, not "offline"', async () => {
      await page.context().setOffline(false);
      await expect(syncStatus(page)).toContainText(
        'Sign in · 1 change not synced',
      );
      await expect(page.getByRole('link', { name: title })).toBeVisible(); // still usable
      await expectAccessible(page);
    });

    await test.step('signing out warns about the change that is not synced', async () => {
      // In the app, not by address: a new page load would ask the server and find no session.
      await page.getByRole('link', { name: 'Space' }).click();
      await page.getByRole('link', { name: /Profile/ }).click();
      await page.getByRole('button', { name: 'Sign out' }).click();
      const dialog = page.getByRole('dialog', {
        name: 'Sign out without syncing?',
      });
      await expect(dialog).toContainText('1 change has not reached the server');
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toBeHidden();
    });

    await test.step('signing in again sends the change', async () => {
      await syncStatus(page)
        .getByRole('link', { name: /Sign in/ })
        .click();
      await expect(page).toHaveURL(/\/sign-in$/);
      await page.getByLabel('Username').fill(account.username);
      await page.getByLabel('Password').fill(account.password);
      // The notice that asked for sign-in is still up beside the form's button.
      await page
        .getByRole('main')
        .getByRole('button', { name: 'Sign in' })
        .click();
      await expect(page).toHaveURL(/\/lists$/);
      await expect(page.getByRole('link', { name: title })).toBeVisible();
      await synced(page);
    });

    await test.step('signing out then clears this device', async () => {
      await page.goto('/space/profile');
      await page.getByRole('button', { name: 'Sign out' }).click();
      await expect(page).toHaveURL(/\/sign-in$/);
      // Everything the device held of the user is gone: every store is empty (or the
      // database does not exist), and so is the remembered space.
      const leftovers = await page.evaluate(
        () =>
          new Promise<number>((resolve, reject) => {
            const open = indexedDB.open('lister');
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
              const db = open.result;
              // `meta` holds the sync engine's own bookkeeping (its status), which the sign-in
              // page's engine writes again; whose data the device holds is checked below.
              const names = [...db.objectStoreNames].filter(
                (name) => name !== 'meta',
              );
              if (names.length === 0) return resolve(0);
              const tx = db.transaction(names);
              let total = 0;
              for (const name of names) {
                const count = tx.objectStore(name).count();
                count.onsuccess = () => (total += count.result);
              }
              tx.oncomplete = () => resolve(total);
            };
          }),
      );
      expect(leftovers).toBe(0);
      const holder = await page.evaluate(
        () =>
          new Promise<unknown>((resolve, reject) => {
            const open = indexedDB.open('lister');
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
              const db = open.result;
              if (!db.objectStoreNames.contains('meta'))
                return resolve(undefined);
              const get = db
                .transaction('meta')
                .objectStore('meta')
                .get('userId');
              get.onsuccess = () => resolve(get.result);
            };
          }),
      );
      expect(holder).toBeUndefined(); // nobody's data is on this device
      expect(
        await page.evaluate(() => localStorage.getItem('lister.space')),
      ).toBeNull();
    });

    // The change reached the server: it is there after signing in again, from a clean device.
    await page.getByLabel('Username').fill(account.username);
    await page.getByLabel('Password').fill(account.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('link', { name: title })).toBeVisible();
    await page.context().close();
  });
});
