import { type Page } from '@playwright/test';
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

for (const [device, viewport] of [
  ['phone', { width: 375, height: 812 }],
  ['desktop', { width: 1280, height: 800 }],
] as const) {
  test.describe(`finished runs in the trash on a ${device}`, () => {
    test.use({ viewport });

    test('a finished run is in the trash; Restore opens it again, with the last check undone', async ({
      page,
      browser,
      expectAccessible,
    }) => {
      test.setTimeout(60_000);
      const list = await createList(page, unique('Shared'));
      await openList(page, list);
      await addItem(page, 'Tent');
      await addItem(page, 'Stove');
      await page.getByRole('button', { name: 'Start run' }).click();
      const runTitle = (
        await page
          .getByRole('heading', { level: 1, name: new RegExp(`^${list} · `) })
          .innerText()
      ).trim();
      const checkbox = (target: Page, title: string) =>
        target.getByRole('checkbox', { name: new RegExp(`^${title}\\b`) });
      const runLink = (target: Page) =>
        target
          .getByRole('list', { name: 'Runs' })
          .getByRole('link', { name: runTitle });

      await test.step('finish it: it leaves the active runs', async () => {
        await checkbox(page, 'Tent').check();
        await checkbox(page, 'Stove').check();
        await expect(page).toHaveURL(/\/runs$/);
        await expect(runLink(page)).toHaveCount(0);
        await synced(page);
      });

      await test.step('it is in the trash, with who finished it', async () => {
        await page
          .getByRole('navigation', { name: 'Main' })
          .getByRole('link', { name: 'Space' })
          .click();
        await page.getByRole('link', { name: /Trash/ }).click();
        await expect(
          page
            .getByRole('list', { name: /Deleted lists and items/ })
            .getByRole('listitem')
            .filter({ hasText: runTitle }),
        ).toContainText('Finished run · 2 items · finished by you, today');
        await expectAccessible();
      });

      await test.step('Restore brings it back among the active runs', async () => {
        await page.getByRole('button', { name: `Restore ${runTitle}` }).click();
        await expect(page.getByText(`Restored “${runTitle}”`)).toBeVisible();
        await page
          .getByRole('navigation', { name: 'Main' })
          .getByRole('link', { name: 'Runs' })
          .click();
        await expect(runLink(page)).toBeVisible();
        await runLink(page).click();
        await expect(checkbox(page, 'Tent')).toBeChecked();
        await expect(checkbox(page, 'Stove')).not.toBeChecked();
        await expect(page.getByText('1 of 2 done')).toBeVisible();
      });

      await test.step('another device has it, too', async () => {
        await synced(page);
        const other = await otherDevice(browser);
        await other.goto('/runs');
        await expect(runLink(other)).toBeVisible();
        await other.context().close();
      });
    });
  });
}
