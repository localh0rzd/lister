import {
  createAccount,
  signInThroughTheUi,
  signedOutPage,
} from './support/accounts';
import { createList, unique } from './support/app';
import { expect, test } from './support/fixtures';

const layouts = [
  ['a phone (375 px)', { width: 375, height: 812 }],
  ['a desktop (1280 px)', { width: 1280, height: 800 }],
] as const;

for (const [name, viewport] of layouts) {
  test.describe(`space button on ${name}`, () => {
    test.use({ viewport });

    test('shows the current space on every page and switches space from the app bar', async ({
      browser,
      expectAccessible,
    }) => {
      const account = await createAccount('spacebtn');
      const page = await signedOutPage(browser);
      await signInThroughTheUi(page, account);
      const other = unique('Trip');
      const button = (spaceName: string | RegExp) =>
        page.getByRole('button', {
          name: new RegExp(`^Space: ${spaceName}, switch space$`),
        });
      const anyButton = page.getByRole('button', {
        name: /^Space: .*, switch space$/,
      });

      await test.step('the name shows on Lists, also with one space', async () => {
        await page.goto('/lists');
        await expect(anyButton).toBeVisible();
        await expectAccessible(page);
      });

      const home = (await anyButton.getAttribute('aria-label'))!
        .replace(/^Space: /, '')
        .replace(/, switch space$/, '');
      const homeList = await createList(page, unique('Home list'));

      await test.step('it also shows on Settings', async () => {
        await page.goto('/settings');
        await expect(anyButton).toBeVisible();
      });

      await test.step('create another space', async () => {
        await page.goto('/space');
        await page.getByRole('button', { name: 'New space' }).click();
        const dialog = page.getByRole('dialog', { name: 'New space' });
        await dialog.getByLabel('Name').fill(other);
        await dialog.getByRole('button', { name: 'Create' }).click();
        await expect(dialog).toBeHidden();
        await expect(button(other)).toBeVisible();
      });

      await test.step('the menu marks the current space and switches', async () => {
        await page.goto('/lists');
        await expect(page.getByRole('link', { name: homeList })).toHaveCount(0);
        await button(other).click();
        await expect(
          page.getByRole('menuitemradio', { name: other }),
        ).toHaveAttribute('aria-checked', 'true');
        await expectAccessible(page);
        await page.getByRole('menuitemradio', { name: home }).click();
        await expect(button(home)).toBeVisible();
        await expect(page.getByRole('link', { name: homeList })).toBeVisible();
      });

      await test.step('the last entry opens the Space page', async () => {
        await button(home).click();
        await page.getByRole('menuitem', { name: 'Spaces…' }).click();
        await expect(page).toHaveURL(/\/space$/);
      });

      await test.step('a long name is cut off and keeps the bar in place', async () => {
        const long = unique('L'.repeat(60));
        await page.getByRole('button', { name: 'New space' }).click();
        const dialog = page.getByRole('dialog', { name: 'New space' });
        await dialog.getByLabel('Name').fill(long);
        await dialog.getByRole('button', { name: 'Create' }).click();
        await expect(dialog).toBeHidden();
        await page.goto('/lists');
        const trigger = anyButton;
        await expect(trigger).toContainText('LLLL');
        const box = (await trigger.boundingBox())!;
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        await expect(
          page.getByRole('combobox', { name: 'Search' }),
        ).toBeInViewport();
        await expectAccessible(page);
      });
    });
  });
}
