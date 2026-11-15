import { expect, test } from './support/fixtures';
import {
  addItem,
  createList,
  openList,
  shellIsCached,
  synced,
} from './support/app';

for (const [name, viewport] of [
  ['phone', { width: 375, height: 812 }],
  ['desktop', { width: 1280, height: 800 }],
] as const) {
  test.describe(`sync status on the Space page (${name})`, () => {
    test.use({ viewport });

    test('shows offline and the unsynced changes, then "Sync now" catches up', async ({
      page,
      context,
      expectAccessible,
    }) => {
      test.setTimeout(120_000);
      const title = await createList(page);
      await openList(page, title);
      await addItem(page, 'Tent');
      await synced(page);

      await page.evaluate(() => navigator.serviceWorker.ready);
      await expect
        .poll(() => shellIsCached(page), { timeout: 60_000 })
        .toBe(true);
      const main = page.getByRole('navigation', { name: 'Main' });
      await context.setOffline(true);
      await addItem(page, 'Stove');
      await main.getByRole('link', { name: 'Space' }).click();
      const sync = page.locator('lister-sync-section');
      await expect(sync).toContainText('Offline');
      await expect(sync).toContainText('1 change not synced');
      await expect(sync).toContainText('Last synced:');
      await expect(sync).not.toContainText('Last synced: never');
      await expect(sync.getByText('No changes were refused.')).toBeHidden();
      await sync.getByText('Sync errors (0)').click();
      await expect(sync.getByText('No changes were refused.')).toBeVisible();
      await expectAccessible();

      await context.setOffline(false);
      await sync.getByRole('button', { name: 'Sync now' }).click();
      await expect(sync).toContainText('Online');
      await expect(sync).toContainText('All changes synced');
    });
  });
}
