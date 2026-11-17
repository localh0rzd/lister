import { expect, test } from './support/fixtures';
import { addItem, createList, openList, unique } from './support/app';

for (const [device, viewport] of [
  ['phone', { width: 320, height: 568 }],
  ['desktop', { width: 1280, height: 800 }],
] as const) {
  test.describe(`search on a ${device}`, () => {
    test.use({ viewport });

    test('finds an item, names its list and opens it; finds a list; Escape clears', async ({
      page,
      expectAccessible,
    }) => {
      const stove = unique('Kocher');
      const camping = await createList(page, unique('Camping'));
      await openList(page, camping);
      await addItem(page, stove);
      await page.goto('/lists');

      // "/" focuses the field; accents and case are ignored.
      const field = page.getByRole('combobox', { name: 'Search' });
      await expect(field).toBeVisible();
      await page.keyboard.press('/');
      await expect(field).toBeFocused();
      await field.fill(stove.toUpperCase().replace('KOCHER', 'kôcher'));
      const option = page.getByRole('option', {
        name: `${stove} in ${camping}`,
      });
      await expect(option).toBeVisible();
      await expect(page.getByRole('group', { name: 'Items' })).toBeVisible();
      // Nothing sticks out of the screen, even at 320 px.
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await expectAccessible();

      // Arrow and Enter open the list the item is in.
      await field.press('ArrowDown');
      await field.press('Enter');
      await expect(
        page.getByRole('heading', { level: 1, name: camping }),
      ).toBeVisible();
      await expect(field).toHaveValue('');

      // A list is found by its title, by tapping the result; Escape clears the field.
      await page.goto('/lists');
      await field.fill(camping.slice(0, -3));
      await page
        .getByRole('group', { name: 'Lists' })
        .getByRole('option', { name: camping })
        .click();
      await expect(
        page.getByRole('heading', { level: 1, name: camping }),
      ).toBeVisible();
      await field.fill('nothing like this zzz');
      await expect(
        page.getByRole('option', { name: 'No matches' }),
      ).toBeVisible();
      await field.press('Escape');
      await expect(field).toHaveValue('');
    });

    test('finds an active run', async ({ page }) => {
      const list = await createList(page, unique('Weekend'));
      await openList(page, list);
      await addItem(page, unique('Item'));
      await page.getByRole('button', { name: 'Start run' }).click();
      await page.waitForURL(/\/runs\/.+/);
      await page.goto('/runs');
      const field = page.getByRole('combobox', { name: 'Search' });
      await field.fill(list);
      await page
        .getByRole('group', { name: 'Runs' })
        .getByRole('option', { name: list })
        .click();
      await expect(page).toHaveURL(/\/runs\/.+/);
    });
  });
}
