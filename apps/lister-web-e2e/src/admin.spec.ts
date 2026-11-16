import {
  createAccount,
  signInThroughTheUi,
  signedOutPage,
  uniqueUsername,
} from './support/accounts';
import { expect, test } from './support/fixtures';

const layouts = [
  ['a phone (375 px)', { width: 375, height: 812 }],
  ['a desktop (1280 px)', { width: 1280, height: 800 }],
] as const;

for (const [name, viewport] of layouts) {
  test.describe(`user administration on ${name}`, () => {
    test.use({ viewport });

    test('an admin adds a user, who must choose a password; then edits, promotes, resets and deletes them', async ({
      page,
      browser,
      expectAccessible,
    }) => {
      // Many steps, several password hashes and notices that must fade: about 25 s on its own.
      test.setTimeout(60_000);
      const username = uniqueUsername('admin-ui');
      const row = page.getByRole('listitem').filter({ hasText: username });
      const added = `Added ${username}`;
      const edited = `Edited ${username}`;
      const menu = async (action: string) => {
        await row.getByRole('button', { name: /^More for/ }).click();
        await page.getByRole('menuitem', { name: action }).click();
      };

      await test.step('the Users page is reachable from Space', async () => {
        await page.goto('/space');
        await page.getByRole('link', { name: /Users/ }).click();
        await expect(
          page.getByRole('heading', { level: 1, name: 'Users' }),
        ).toBeVisible();
        await expect(row).toHaveCount(0);
        await expectAccessible();
      });

      await test.step('adding a user', async () => {
        await page.getByRole('button', { name: 'Add user' }).click();
        const dialog = page.getByRole('dialog', { name: 'Add user' });
        await expect(dialog.getByLabel('Username')).toBeVisible();
        await expectAccessible();
        await dialog.getByLabel('Username').fill(username);
        await dialog.getByLabel('Display name').fill(added);
        await dialog
          .getByLabel('Temporary password')
          .fill('temporary-test-password');
        await dialog.getByRole('button', { name: 'Add' }).click();
        await expect(dialog).toBeHidden();
        await expect(row).toContainText('Must choose a password');
      });

      await test.step('the new user is made to choose their own password', async () => {
        const other = await signedOutPage(browser);
        await other.goto('/sign-in');
        await other.getByLabel('Username').fill(username);
        await other.getByLabel('Password').fill('temporary-test-password');
        await other
          .getByRole('button', { name: 'Sign in', exact: true })
          .click();
        await expect(other).toHaveURL(/\/change-password$/);
        await expect(
          other.getByRole('navigation', { name: 'Main' }),
        ).toHaveCount(0);
        await other.goto('/lists'); // nothing else is open to them yet
        await expect(other).toHaveURL(/\/change-password$/);
        await other
          .getByLabel('Temporary password')
          .fill('temporary-test-password');
        await other
          .getByLabel('New password', { exact: true })
          .fill('my-own-long-password');
        await other
          .getByLabel('Repeat the new password')
          .fill('my-own-long-password');
        await other.getByRole('button', { name: 'Change password' }).click();
        await expect(other).toHaveURL(/\/lists$/);
        await other.context().close();
        await page.reload();
        await expect(row).not.toContainText('Must choose a password');
      });

      await test.step('editing the name', async () => {
        await menu('Edit');
        const dialog = page.getByRole('dialog', { name: 'Edit user' });
        await dialog.getByLabel('Display name').fill(edited);
        await dialog.getByRole('button', { name: 'Save' }).click();
        await expect(dialog).toBeHidden();
        await expect(row).toContainText(edited);
      });

      await test.step('granting and revoking admin', async () => {
        await menu('Make admin');
        await expect(row).toContainText('Admin');
        await menu('Remove admin');
        await expect(row).not.toContainText('Admin');
      });

      await test.step('resetting the password signs them out of the old one', async () => {
        await menu('Reset password');
        const dialog = page.getByRole('dialog', { name: 'Reset password' });
        // Let the earlier notices fade: a snackbar mid-fade fails the contrast check.
        await expect(page.locator('.mat-mdc-snack-bar-container')).toHaveCount(
          0,
        );
        await expectAccessible();
        await dialog
          .getByLabel('Temporary password')
          .fill('another-temporary-password');
        await dialog.getByRole('button', { name: 'Reset password' }).click();
        await expect(dialog).toBeHidden();
        await page.reload();
        await expect(row).toContainText('Must choose a password');
      });

      await test.step('deleting asks first', async () => {
        await menu('Delete');
        const dialog = page.getByRole('dialog', {
          name: `Delete ${edited}?`,
        });
        await dialog.getByRole('button', { name: 'Cancel' }).click();
        await expect(row).toHaveCount(1);
        await menu('Delete');
        await page
          .getByRole('dialog')
          .getByRole('button', { name: 'Delete' })
          .click();
        await expect(row).toHaveCount(0);
      });
    });

    test('someone who is not an admin sees no user administration', async ({
      browser,
    }) => {
      const account = await createAccount('plain');
      const page = await signedOutPage(browser);
      await signInThroughTheUi(page, account);

      await page.goto('/space');
      await expect(page.getByRole('link', { name: /Profile/ })).toBeVisible();
      await expect(page.getByRole('link', { name: /Users/ })).toHaveCount(0);
      await page.goto('/space/users');
      await expect(page).toHaveURL(/\/space$/);
      await page.context().close();
    });
  });
}
