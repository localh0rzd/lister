import {
  createAccount,
  signInThroughTheUi,
  signedOutPage,
} from './support/accounts';
import { unique } from './support/app';
import { expect, test } from './support/fixtures';

test('a user who is visible is suggested when another user adds a member', async ({
  browser,
  expectAccessible,
}) => {
  test.setTimeout(90_000);
  const anna = await createAccount('anna');
  const ben = await createAccount('ben');
  const annaPage = await signedOutPage(browser);
  const benPage = await signedOutPage(browser);
  await signInThroughTheUi(annaPage, anna);
  await signInThroughTheUi(benPage, ben);
  const space = unique('Trip');

  await test.step('a user is hidden until they switch visibility on in their profile', async () => {
    await benPage.goto('/settings');
    await benPage.getByRole('link', { name: /Profile/ }).click();
    const toggle = benPage.getByRole('switch', {
      name: 'Visible to other users',
    });
    await expect(toggle).not.toBeChecked();
    await expect(
      benPage.getByText('Others can find you when they add members to a space'),
    ).toBeVisible();
    await toggle.click();
    await expect(toggle).toBeChecked();
  });

  await test.step('the owner types two letters, sees them and picks them', async () => {
    await annaPage.goto('/space');
    await annaPage.getByRole('button', { name: 'New space' }).click();
    await annaPage
      .getByRole('dialog', { name: 'New space' })
      .getByLabel('Name')
      .fill(space);
    await annaPage
      .getByRole('dialog', { name: 'New space' })
      .getByRole('button', { name: 'Create' })
      .click();
    await annaPage.getByRole('button', { name: 'Add member' }).click();
    const dialog = annaPage.getByRole('dialog', { name: 'Add a member' });
    await dialog.getByLabel('Username').fill(ben.username.slice(0, 5));
    const option = annaPage.getByRole('option', {
      name: new RegExp(ben.username),
    });
    await expect(option).toBeVisible();
    await expect(option).toContainText(ben.displayName);
    await expectAccessible(annaPage);
    await option.click();
    await expect(dialog.getByLabel('Username')).toHaveValue(ben.username);
    await dialog.getByRole('button', { name: 'Add' }).click();
    await expect(dialog).toBeHidden();
    await expect(annaPage.getByRole('list', { name: 'Members' })).toContainText(
      ben.displayName,
    );
  });
});
