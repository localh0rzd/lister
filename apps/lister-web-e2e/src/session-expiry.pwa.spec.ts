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
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
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
      // The user comes back to the page they were on.
      await expect(page).toHaveURL(/\/sign-in\?returnUrl=%2Fspace%2Fprofile$/);
      await page.getByLabel('Username').fill(account.username);
      await page.getByLabel('Password').fill(account.password);
      // The notice that asked for sign-in is still up beside the form's button.
      await page
        .getByRole('main')
        .getByRole('button', { name: 'Sign in', exact: true })
        .click();
      await expect(page).toHaveURL(/\/space\/profile$/);
      await synced(page);
      await page.getByRole('link', { name: 'Lists' }).click();
      await expect(page.getByRole('link', { name: title })).toBeVisible();
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
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('link', { name: title })).toBeVisible();
    await page.context().close();
  });

  test("signing in as somebody else discards the previous user's unsynced changes, and they never reach the server", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const anna = await createAccount('prev');
    const ben = await createAccount('next');
    const page = await signedOutPage(browser);
    const signIn = async (who: typeof anna) => {
      await page.getByLabel('Username').fill(who.username);
      await page.getByLabel('Password').fill(who.password);
      // The notice that asked for sign-in may still be up beside the form's button.
      await page
        .getByRole('main')
        .getByRole('button', { name: 'Sign in', exact: true })
        .click();
      await expect(page).toHaveURL(/\/lists$/);
    };
    await page.goto('/sign-in');
    await signIn(anna);
    await synced(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect
      .poll(() => shellIsCached(page), { timeout: 60_000 })
      .toBe(true);

    await page.context().setOffline(true);
    await page.context().clearCookies();
    const title = await createList(page, `Annas draft ${Date.now()}`);
    await page.context().setOffline(false);
    await expect(syncStatus(page)).toContainText(
      'Sign in · 1 change not synced',
    );

    await syncStatus(page)
      .getByRole('link', { name: /Sign in/ })
      .click();
    await signIn(ben);

    await expect(
      page.getByText(
        '1 unsynced change of the previous user on this device was discarded.',
      ),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: title })).toHaveCount(0);
    await synced(page);

    // Nothing of Anna's reached the server under either account.
    const other = await signedOutPage(browser);
    await other.goto('/sign-in');
    await other.getByLabel('Username').fill(anna.username);
    await other.getByLabel('Password').fill(anna.password);
    await other.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(other).toHaveURL(/\/lists$/);
    await synced(other);
    await expect(other.getByRole('link', { name: title })).toHaveCount(0);
    await other.context().close();
    await page.context().close();
  });
});
