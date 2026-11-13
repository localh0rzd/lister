import {
  type Account,
  createAccount,
  signInThroughTheUi,
  signedOutPage,
} from './support/accounts';
import { expect, test } from './support/fixtures';

const layouts = [
  ['a phone (375 px)', { width: 375, height: 812 }],
  ['a desktop (1280 px)', { width: 1280, height: 800 }],
] as const;

for (const [name, viewport] of layouts) {
  test.describe(`sign-in, profile and sign-out on ${name}`, () => {
    test.use({ viewport });
    let account: Account;
    test.beforeEach(async () => {
      account = await createAccount('signin');
    });

    test('a signed-out visitor is sent to sign-in, signs in, edits the profile and signs out', async ({
      browser,
      expectAccessible,
    }) => {
      const page = await signedOutPage(browser);

      await test.step('protected pages lead to the sign-in page, without navigation', async () => {
        await page.goto('/lists');
        await expect(page).toHaveURL(/\/sign-in\?returnUrl=%2Flists$/);
        await expect(
          page.getByRole('heading', { level: 1, name: 'Sign in to Lister' }),
        ).toBeVisible();
        await expect(
          page.getByRole('navigation', { name: 'Main' }),
        ).toHaveCount(0);
        await expectAccessible(page);
      });

      await test.step('a wrong password is explained', async () => {
        await page.getByLabel('Username').fill(account.username);
        await page.getByLabel('Password').fill('not the password');
        await page
          .getByRole('button', { name: 'Sign in', exact: true })
          .click();
        await expect(page.getByRole('alert')).toBeVisible();
        await expect(page).toHaveURL(/\/sign-in/);
      });

      await test.step('the right one returns to the page that was asked for', async () => {
        await page.getByLabel('Password').fill(account.password);
        await page
          .getByRole('button', { name: 'Sign in', exact: true })
          .click();
        await expect(page).toHaveURL(/\/lists$/);
        await expect(
          page.getByRole('navigation', { name: 'Main' }),
        ).toBeVisible();
      });

      await test.step('the profile', async () => {
        await page.goto('/space');
        await page.getByRole('link', { name: /Profile/ }).click();
        await expect(
          page.getByRole('heading', { level: 1, name: 'Profile' }),
        ).toBeVisible();
        await expectAccessible(page);
        await page.getByLabel('Display name').fill('Renamed Tester');
        await page.getByRole('button', { name: 'Save name' }).click();
        await expect(page.getByText('Name saved')).toBeVisible();
        await page.reload();
        await expect(page.getByLabel('Display name')).toHaveValue(
          'Renamed Tester',
        );
      });

      await test.step('a new password works at the next sign-in', async () => {
        await page.getByLabel('Current password').fill(account.password);
        await page
          .getByLabel('New password', { exact: true })
          .fill('another-long-password');
        await page
          .getByLabel('Repeat the new password')
          .fill('another-long-password');
        await page.getByRole('button', { name: 'Change password' }).click();
        await expect(page.getByText('Password changed')).toBeVisible();
        account.password = 'another-long-password';
      });

      await test.step('signing out leads back to sign-in and ends the session', async () => {
        await page.getByRole('button', { name: 'Sign out' }).click();
        await expect(page).toHaveURL(/\/sign-in$/);
        await page.goto('/lists');
        await expect(page).toHaveURL(/\/sign-in\?returnUrl/);
      });

      await signInThroughTheUi(page, account);
      await page.context().close();
    });
  });
}

test.describe('first-run setup', () => {
  test('the page checks the form and says when setup is closed', async ({
    browser,
    expectAccessible,
  }) => {
    const page = await signedOutPage(browser);
    await page.goto('/sign-in');
    await page.getByRole('link', { name: 'First-run setup' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'First-run setup' }),
    ).toBeVisible();
    await expectAccessible(page);

    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(
      page.getByText('Enter the setup token from the server log'),
    ).toBeVisible();

    // The e2e servers already have an account (global setup), so setup is closed.
    await page.getByLabel('Setup token').fill('whatever');
    await page.getByLabel('Username').fill('first-admin');
    await page.getByLabel('Display name').fill('First Admin');
    await page.getByLabel('Password').fill('a-long-test-password');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Setup is not available',
    );
    await page.context().close();
  });
});
