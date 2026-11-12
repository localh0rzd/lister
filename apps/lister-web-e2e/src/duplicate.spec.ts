import { expect, test } from './support/fixtures';
import {
  addItem,
  createList,
  includeList,
  itemTitles,
  openList,
  otherDevice,
  section,
  synced,
  syncStatus,
  unique,
} from './support/app';

test.describe('duplicate a list', () => {
  test('offline: a copy with the items in order and the same includes, synced later', async ({
    page,
    context,
    browser,
  }) => {
    test.setTimeout(60_000);
    const camping = await createList(page, unique('Camping'));
    const toiletries = await createList(page, unique('Toiletries'));
    await openList(page, toiletries);
    await addItem(page, 'Soap');
    await openList(page, camping);
    await addItem(page, 'Tent');
    await addItem(page, 'Stove');
    await includeList(page, toiletries);
    await page.goto('/lists');
    await synced(page);

    await context.setOffline(true);
    await expect(syncStatus(page)).toContainText('Offline');
    await page.getByRole('button', { name: `More for ${camping}` }).click();
    await page.getByRole('menuitem', { name: 'Duplicate' }).click();
    const copy = `Copy of ${camping}`;
    await expect(page.getByText(`Created “${copy}”`)).toBeVisible();
    await expect(
      page.getByRole('listitem').filter({ hasText: copy }),
    ).toContainText('2 items · 3 in total · 1 list included');

    // The notice leads to the copy (lists are sorted by title, so it may be off-screen).
    await page.getByRole('button', { name: 'Open' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: copy }),
    ).toBeVisible();
    await expect(section(page, toiletries)).toContainText('Soap');
    await expect(
      page.getByRole('list', { name: 'Items' }).locator('.item .title'),
    ).toHaveText(['Tent', 'Stove']);

    await context.setOffline(false);
    await synced(page);
    const other = await otherDevice(browser);
    await openList(other, copy);
    await expect(itemTitles(other)).toContainText(['Tent', 'Stove', 'Soap']);
    await other.context().close();
  });
});
