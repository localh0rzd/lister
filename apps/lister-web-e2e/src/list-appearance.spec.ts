import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { createList, openList, otherDevice, synced } from './support/app';

const avatarOf = (page: Page, title: string) =>
  page
    .getByRole('listitem')
    .filter({ hasText: title })
    .locator('lister-list-avatar');

async function pick(page: Page, title: string, colour: string, icon: string) {
  await page.getByRole('button', { name: `More for ${title}` }).click();
  await page.getByRole('menuitem', { name: 'Colour and icon' }).click();
  const dialog = page.getByRole('dialog', { name: 'Colour and icon' });
  await dialog
    .getByRole('group', { name: 'Colour' })
    .getByRole('button', { name: colour })
    .click();
  await dialog
    .getByRole('group', { name: 'Icon' })
    .getByRole('button', { name: icon })
    .click();
  return dialog;
}

for (const [device, viewport] of [
  ['phone', { width: 375, height: 812 }],
  ['desktop', { width: 1280, height: 800 }],
] as const) {
  test.describe(`a colour and icon per list on a ${device}`, () => {
    test.use({ viewport });

    test('set them in the menu, see them on Lists, in the header and on a run, and clear them', async ({
      page,
      expectAccessible,
    }) => {
      const title = await createList(page);

      const dialog = await pick(page, title, 'teal', 'Tent');
      await expectAccessible();
      await dialog.getByRole('button', { name: 'Save' }).click();

      const avatar = avatarOf(page, title);
      await expect(avatar).toHaveAttribute('data-colour', 'teal');
      await expect(avatar).toHaveText('camping');
      await expectAccessible();

      await test.step('in the dark theme too (D26: the tones keep contrast)', async () => {
        await page.emulateMedia({ colorScheme: 'dark' });
        await expectAccessible();
        await page.getByRole('button', { name: `More for ${title}` }).click();
        await page.getByRole('menuitem', { name: 'Colour and icon' }).click();
        const dark = page.getByRole('dialog', { name: 'Colour and icon' });
        await expect(
          dark.getByRole('group', { name: 'Colour' }).getByRole('button', {
            name: 'teal',
          }),
        ).toHaveAttribute('aria-pressed', 'true');
        await expectAccessible();
        await dark.getByRole('button', { name: 'Cancel' }).click();
        await expect(dark).toBeHidden();
        await page.emulateMedia({ colorScheme: 'light' });
      });

      await test.step('in the list header', async () => {
        await openList(page, title);
        await expect(
          page.locator('.header lister-list-avatar'),
        ).toHaveAttribute('data-colour', 'teal');
        await expectAccessible();
      });

      await test.step('on a run started from the list', async () => {
        await page.getByRole('button', { name: 'Start run' }).click();
        await expect(
          page.getByRole('heading', { level: 1, name: title }),
        ).toBeVisible();
        await expect(page.locator('.header lister-list-avatar')).toHaveText(
          'camping',
        );
      });

      await test.step('clearing both goes back to the first letter', async () => {
        await page.goto('/lists');
        const again = await pick(page, title, 'teal', 'Tent'); // choosing again clears
        await again.getByRole('button', { name: 'Save' }).click();
        await expect(avatarOf(page, title)).not.toHaveAttribute(
          'data-colour',
          /.+/,
        );
        await expect(avatarOf(page, title)).toHaveText(title[0].toUpperCase());
      });
    });

    test('reaches another device, also when set offline', async ({
      page: a,
      browser,
    }) => {
      const title = await createList(a);
      const b = await otherDevice(browser);
      await b.goto('/lists');
      await expect(b.getByRole('link', { name: title })).toBeVisible();

      const dialog = await pick(a, title, 'pink', 'Cake');
      await dialog.getByRole('button', { name: 'Save' }).click();
      await expect(avatarOf(b, title)).toHaveAttribute('data-colour', 'pink');
      await expect(avatarOf(b, title)).toHaveText('cake');

      await a.context().setOffline(true);
      const offline = await pick(a, title, 'blue', 'Cake'); // clears the icon
      await offline.getByRole('button', { name: 'Save' }).click();
      await expect(avatarOf(a, title)).toHaveAttribute('data-colour', 'blue');
      await a.context().setOffline(false);
      await synced(a);
      await expect(avatarOf(b, title)).toHaveAttribute('data-colour', 'blue');
      await expect(avatarOf(b, title)).toHaveText(title[0].toUpperCase());
      await b.context().close();
    });
  });
}
