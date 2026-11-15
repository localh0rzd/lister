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
  });
}
