import { expect, test } from './support/fixtures';
import {
  addItem,
  createList,
  itemMenu,
  itemTitles,
  openList,
  otherDevice,
  synced,
  unique,
} from './support/app';

for (const [device, viewport] of [
  ['phone', { width: 375, height: 812 }],
  ['desktop', { width: 1280, height: 800 }],
] as const) {
  test.describe(`trash on a ${device}`, () => {
    test.use({ viewport });

    test('restore a deleted list with its items, and a deleted item', async ({
      page,
      browser,
      expectAccessible,
    }) => {
      // A long flow of many steps; under the full suite's parallel load it needs more than 30 s.
      test.setTimeout(60_000);
      const camping = await createList(page, unique('Camping'));
      const beach = await createList(page, unique('Beach'));
      // The e2e database is shared by every test in a run: the deleted item needs its own name.
      const hat = unique('Hat');
      await openList(page, camping);
      await addItem(page, 'Tent');
      await addItem(page, 'Stove');
      await openList(page, beach);
      await addItem(page, 'Towel');
      await addItem(page, hat);

      await test.step('delete an item and a list', async () => {
        await itemMenu(page, hat, 'Delete');
        await expect(itemTitles(page)).toHaveText(['Towel']);
        await page.goto('/lists');
        await page.getByRole('button', { name: `More for ${camping}` }).click();
        await page.getByRole('menuitem', { name: 'Delete' }).click();
        await expect(page.getByRole('link', { name: camping })).toBeHidden();
      });

      await test.step('both are in the trash, from Space', async () => {
        await page
          .getByRole('navigation', { name: 'Main' })
          .getByRole('link', { name: 'Space' })
          .click();
        await page.getByRole('link', { name: /Trash/ }).click();
        const heading = page.getByRole('heading', { level: 1, name: 'Trash' });
        await expect(heading).toBeVisible();
        // Really on screen, also on a phone (not only for screen readers).
        expect((await heading.boundingBox())?.height ?? 0).toBeGreaterThan(10);
        const entries = page.getByRole('list', {
          name: 'Deleted lists and items',
        });
        await expect(
          entries.getByRole('listitem').filter({ hasText: camping }),
        ).toContainText('List · 2 items · deleted by you, today');
        await expect(
          entries.getByRole('listitem').filter({ hasText: hat }),
        ).toContainText(`Item in ${beach} · deleted by you, today`);
        await expectAccessible();
      });

      await test.step('restore them', async () => {
        await page.getByRole('button', { name: `Restore ${camping}` }).click();
        await expect(page.getByText(`Restored “${camping}”`)).toBeVisible();
        await page.getByRole('button', { name: `Restore ${hat}` }).click();
        await expect(
          page.getByRole('button', { name: `Restore ${hat}` }),
        ).toBeHidden();

        await openList(page, camping);
        await expect(itemTitles(page)).toHaveText(['Tent', 'Stove']);
        await openList(page, beach);
        await expect(itemTitles(page)).toHaveText(['Towel', hat]);
      });

      await test.step('the restores reached the server: another device has them', async () => {
        await synced(page);
        const other = await otherDevice(browser);
        await openList(other, camping);
        await expect(itemTitles(other)).toHaveText(['Tent', 'Stove']);
        await openList(other, beach);
        await expect(itemTitles(other)).toHaveText(['Towel', hat]);
        await other.context().close();
      });
    });
  });
}
