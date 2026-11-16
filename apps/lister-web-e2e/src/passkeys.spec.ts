import type { Page } from '@playwright/test';
import { createAccount, signedOutPage } from './support/accounts';
import { expect, test } from './support/fixtures';

const layouts = [
  ['a phone (375 px)', { width: 375, height: 812 }],
  ['a desktop (1280 px)', { width: 1280, height: 800 }],
] as const;

/**
 * A virtual authenticator (Chromium's WebAuthn DevTools domain) that keeps discoverable
 * credentials and always passes user verification, so no real device is needed.
 */
async function addVirtualAuthenticator(
  page: Page,
  { answers = true }: { answers?: boolean } = {},
) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send(
    'WebAuthn.addVirtualAuthenticator',
    {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        // Without presence simulation the ceremony waits for a touch that never comes.
        automaticPresenceSimulation: answers,
      },
    },
  );
  return {
    credentials: async () =>
      (await cdp.send('WebAuthn.getCredentials', { authenticatorId }))
        .credentials,
  };
}

/**
 * Replaces `navigator.credentials.create/get`, as a password manager extension does: `refuse`
 * rejects with `NotAllowedError` at once, `hang` never answers (but honours nothing, not even
 * the abort signal).
 */
async function stubCredentials(page: Page, mode: 'refuse' | 'hang') {
  await page.addInitScript((m) => {
    const answer = () =>
      m === 'refuse'
        ? Promise.reject(new DOMException('Not allowed', 'NotAllowedError'))
        : new Promise<never>(() => undefined);
    navigator.credentials.create = answer;
    navigator.credentials.get = answer;
  }, mode);
}

/** The sync status the engine keeps in the local database (`meta.status`), or `null`. */
function storedSyncStatus(page: Page) {
  return page.evaluate(
    () =>
      new Promise<unknown>((resolve) => {
        const open = indexedDB.open('lister');
        // Not created by the app yet: don't create it here.
        open.onupgradeneeded = () => open.transaction?.abort();
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('meta')) {
            db.close();
            return resolve(null);
          }
          const get = db.transaction('meta').objectStore('meta').get('status');
          get.onsuccess = () => {
            db.close();
            const row = get.result as { value: string } | undefined;
            resolve(row ? JSON.parse(row.value) : null);
          };
        };
      }),
  );
}

async function openProfile(page: Page) {
  await page.goto('/space');
  await page.getByRole('link', { name: /Profile/ }).click();
  await expect(page.getByLabel('Passkey name')).toBeVisible();
}

for (const [name, viewport] of layouts) {
  test.describe(`passkeys on ${name}`, () => {
    test.use({ viewport });

    test('a user adds a passkey, signs out, signs in with it and removes it', async ({
      browser,
      expectAccessible,
    }) => {
      const account = await createAccount('passkey');
      const page = await signedOutPage(browser);
      const authenticator = await addVirtualAuthenticator(page);

      await test.step('sign in with the password', async () => {
        await page.goto('/sign-in');
        await page.getByLabel('Username').fill(account.username);
        await page.getByLabel('Password').fill(account.password);
        await page
          .getByRole('button', { name: 'Sign in', exact: true })
          .click();
        await expect(
          page.getByRole('navigation', { name: 'Main' }),
        ).toBeVisible();
      });

      await test.step('the profile has no passkeys yet', async () => {
        await page.goto('/space');
        await page.getByRole('link', { name: /Profile/ }).click();
        await expect(page.getByText('You have no passkeys yet')).toBeVisible();
        await expectAccessible(page);
      });

      await test.step('adding one needs a name', async () => {
        await page.getByRole('button', { name: 'Add a passkey' }).click();
        await expect(page.getByText('Give the passkey a name')).toBeVisible();
        expect(await authenticator.credentials()).toHaveLength(0);
      });

      await test.step('add a passkey', async () => {
        await page.getByLabel('Passkey name').fill('My laptop');
        await page.getByRole('button', { name: 'Add a passkey' }).click();
        await expect(page.getByText('Passkey “My laptop” added')).toBeVisible();
        const list = page.getByRole('list', { name: 'Your passkeys' });
        await expect(list).toContainText('My laptop');
        await expect(list).toContainText('Never used');
        await expect(page.getByLabel('Passkey name')).toHaveValue('');
        expect(await authenticator.credentials()).toHaveLength(1);
        await expectAccessible(page);
      });

      await test.step('sign out', async () => {
        await page.getByRole('button', { name: 'Sign out' }).click();
        await expect(page).toHaveURL(/\/sign-in$/);
      });

      await test.step('sign in with the passkey, without a username', async () => {
        await expect(
          page.getByRole('button', { name: 'Sign in with a passkey' }),
        ).toBeVisible();
        await expectAccessible(page);
        await page
          .getByRole('button', { name: 'Sign in with a passkey' })
          .click();
        await expect(
          page.getByRole('navigation', { name: 'Main' }),
        ).toBeVisible();
        await expect(page).not.toHaveURL(/sign-in/);
      });

      await test.step('the passkey shows when it was last used, and can be removed', async () => {
        await page.goto('/space');
        await page.getByRole('link', { name: /Profile/ }).click();
        const list = page.getByRole('list', { name: 'Your passkeys' });
        await expect(list).toContainText('Last used');
        await page
          .getByRole('button', { name: 'Remove passkey My laptop' })
          .click();
        await expect(page.getByRole('dialog')).toContainText(
          'Remove this passkey?',
        );
        await expectAccessible(page);
        await page
          .getByRole('dialog')
          .getByRole('button', { name: 'Remove' })
          .click();
        await expect(page.getByText('You have no passkeys yet')).toBeVisible();
        await expect(
          page.getByText('Passkey “My laptop” removed'),
        ).toBeVisible();
      });

      await page.context().close();
    });

    test('a passkey prompt nobody answers does not lock the sign-in page', async ({
      browser,
      expectAccessible,
    }) => {
      const account = await createAccount('passkey-hang');
      const page = await signedOutPage(browser);
      await addVirtualAuthenticator(page, { answers: false });
      await page.goto('/sign-in');

      await test.step('while the authenticator waits, the password form still works and Cancel is offered', async () => {
        await page
          .getByRole('button', { name: 'Sign in with a passkey' })
          .click();
        const cancel = page.getByRole('button', { name: 'Cancel' });
        await expect(cancel).toBeVisible();
        await expect(
          page.getByRole('button', { name: 'Sign in', exact: true }),
        ).toBeEnabled();
        await expect(page.getByLabel('Username')).toBeEnabled();
        await expectAccessible(page);
      });

      await test.step('cancelling gives the passkey button back, without an error', async () => {
        await page.getByRole('button', { name: 'Cancel' }).click();
        await expect(
          page.getByRole('button', { name: 'Sign in with a passkey' }),
        ).toBeEnabled();
        await expect(page.getByRole('alert')).toHaveCount(0);
      });

      await test.step('starting a password sign-in while a prompt is open cancels the prompt', async () => {
        await page
          .getByRole('button', { name: 'Sign in with a passkey' })
          .click();
        await expect(
          page.getByRole('button', { name: 'Cancel' }),
        ).toBeVisible();
        await page.getByLabel('Username').fill(account.username);
        await page.getByLabel('Password').fill(account.password);
        await page
          .getByRole('button', { name: 'Sign in', exact: true })
          .click();
        await expect(
          page.getByRole('navigation', { name: 'Main' }),
        ).toBeVisible();
      });

      await page.context().close();
    });

    test('a refused or dismissed passkey request gives the forms back', async ({
      browser,
    }) => {
      const account = await createAccount('passkey-refused');
      const page = await signedOutPage(browser);
      await stubCredentials(page, 'refuse');
      await page.goto('/sign-in');

      await test.step('on the sign-in page the passkey button comes back, with a plain message', async () => {
        const passkey = page.getByRole('button', {
          name: 'Sign in with a passkey',
        });
        await passkey.click();
        await expect(page.getByRole('alert')).toContainText(
          'The passkey request was declined or timed out',
        );
        await expect(page.getByRole('alert')).not.toContainText('cancelled');
        await expect(passkey).toBeEnabled();
        await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(
          0,
        );
        await passkey.click();
        await expect(page.getByRole('alert')).toBeVisible();
        await expect(passkey).toBeEnabled();
      });

      await test.step('on the profile the add button comes back and works again', async () => {
        await page.getByLabel('Username').fill(account.username);
        await page.getByLabel('Password').fill(account.password);
        await page
          .getByRole('button', { name: 'Sign in', exact: true })
          .click();
        await expect(
          page.getByRole('navigation', { name: 'Main' }),
        ).toBeVisible();
        await openProfile(page);
        await page.getByLabel('Passkey name').fill('My phone');
        const add = page.getByRole('button', { name: 'Add a passkey' });
        await add.click();
        await expect(page.getByRole('alert')).toContainText(
          'The passkey request was declined or timed out',
        );
        await expect(add).toBeEnabled();
        await expect(page.getByLabel('Passkey name')).toHaveValue('My phone');
        await add.click();
        await expect(page.getByRole('alert')).toBeVisible();
        await expect(add).toBeEnabled();
      });

      await page.context().close();
    });

    test('a passkey add that is never answered is stopped by Cancel and can be repeated', async ({
      browser,
    }) => {
      const account = await createAccount('passkey-silent');
      const page = await signedOutPage(browser);
      await stubCredentials(page, 'hang');
      await page.goto('/sign-in');
      await page.getByLabel('Username').fill(account.username);
      await page.getByLabel('Password').fill(account.password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(
        page.getByRole('navigation', { name: 'Main' }),
      ).toBeVisible();
      await openProfile(page);

      for (const attempt of [1, 2]) {
        await test.step(`attempt ${attempt}: Cancel stops the prompt`, async () => {
          await page.getByLabel('Passkey name').fill('Silent phone');
          await page.getByRole('button', { name: 'Add a passkey' }).click();
          await page.getByRole('button', { name: 'Cancel' }).click();
          await expect(
            page.getByRole('button', { name: 'Add a passkey' }),
          ).toBeEnabled();
          await expect(page.getByRole('alert')).toHaveCount(0);
        });
      }

      await page.context().close();
    });

    test('no "session ended" notice shows after signing in', async ({
      browser,
    }) => {
      const account = await createAccount('no-stale-notice');
      const page = await signedOutPage(browser);
      await page.goto('/sign-in');
      // The precondition: the signed-out visit has stored a refused connection.
      await expect
        .poll(() => storedSyncStatus(page))
        .toMatchObject({ signInRequired: true });
      // A slow device, made deterministic: another tab holds the sync lock, so the page that
      // loads after signing in reads the stored status before it can write its own.
      const lockHolder = await page.context().newPage();
      await lockHolder.goto('/api/health');
      await lockHolder.evaluate(() => {
        void navigator.locks.request(
          'lister-sync',
          () =>
            new Promise<void>((release) =>
              Object.assign(window, { releaseSyncLock: release }),
            ),
        );
      });
      await page.getByLabel('Username').fill(account.username);
      await page.getByLabel('Password').fill(account.password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.getByRole('link', { name: 'Space' }).click();
      await expect(page.locator('lister-sync-section')).toBeVisible();
      await lockHolder.evaluate(() =>
        (
          window as unknown as { releaseSyncLock: () => void }
        ).releaseSyncLock(),
      );
      // Once the app has connected it is settled: a notice, if raised, stays until dismissed.
      await expect(page.locator('lister-sync-section')).toContainText('Online');
      await expect(page.getByText('Your session has ended')).toHaveCount(0);
      await page.context().close();
    });
  });
}
