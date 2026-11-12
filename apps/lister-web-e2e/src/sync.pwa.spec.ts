import { expect, test } from './support/fixtures';
import {
  addItem,
  createList,
  itemTitles,
  openList,
  otherDevice,
  shellIsCached,
  synced,
  syncStatus,
} from './support/app';

test.describe('offline with the production build', () => {
  test('a reload while offline still shows the data and the pending change, which syncs later', async ({
    page,
    context,
    browser,
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

    await context.setOffline(true);
    await addItem(page, 'Stove');
    await expect(syncStatus(page)).toContainText(
      'Offline · 1 change not synced',
    );

    await page.reload();
    await expect(
      page.getByRole('heading', { level: 1, name: title }),
    ).toBeVisible();
    await expect(itemTitles(page)).toHaveText(['Tent', 'Stove']);
    await expect(syncStatus(page)).toContainText('1 change not synced');

    await context.setOffline(false);
    await synced(page);

    const other = await otherDevice(browser);
    await openList(other, title);
    await expect(itemTitles(other)).toHaveText(['Tent', 'Stove']);
    await other.context().close();
  });
});
