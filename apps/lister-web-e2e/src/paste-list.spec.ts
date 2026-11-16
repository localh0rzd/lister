import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import {
  itemTitles,
  openList,
  otherDevice,
  synced,
  syncStatus,
  unique,
} from './support/app';

const PASTED = [
  '  - Tent',
  '',
  '* Stove',
  '[ ] Lamp',
  '1. tent',
  '[x]  Water filter ',
].join('\n');
const CLEANED = ['Tent', 'Stove', 'Lamp', 'Water filter'];

async function openNewListDialog(page: Page) {
  await page.goto('/lists');
  await page.getByRole('button', { name: 'New list' }).click();
  const dialog = page.getByRole('dialog', { name: 'New list' });
  await expect(dialog.getByLabel('Title')).toBeFocused();
  return dialog;
}

for (const [name, viewport] of [
  ['phone (375 px)', { width: 375, height: 812 }],
  ['desktop (1280 px)', { width: 1280, height: 800 }],
] as const) {
  test.describe(`paste items into a new list on a ${name}`, () => {
    test.use({ viewport });

    test('creates the list with the cleaned-up items in pasted order', async ({
      page,
      expectAccessible,
    }) => {
      const title = unique('Pasted');
      const dialog = await openNewListDialog(page);
      await expectAccessible();

      await dialog.getByLabel('Title').fill(title);
      await dialog.getByLabel('Items (one per line)').fill(PASTED);
      await dialog.getByRole('button', { name: 'Create' }).click();
      await expect(dialog).toBeHidden();

      await expect(
        page.getByRole('listitem').filter({ hasText: title }),
      ).toContainText('4 items');
      await openList(page, title);
      await expect(itemTitles(page)).toHaveText(CLEANED);
      await expectAccessible();
    });
  });
}

test.describe('paste items into a new list', () => {
  test('offline it syncs as one change to another device', async ({
    page,
    context,
    browser,
  }) => {
    test.setTimeout(60_000);
    const title = unique('Offline paste');
    await page.goto('/lists');
    await synced(page);
    await context.setOffline(true);
    await expect(syncStatus(page)).toContainText('Offline');
    await page.getByRole('button', { name: 'New list' }).click();
    const dialog = page.getByRole('dialog', { name: 'New list' });
    await dialog.getByLabel('Title').fill(title);
    await dialog.getByLabel('Items (one per line)').fill(PASTED);
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(
      page.getByRole('listitem').filter({ hasText: title }),
    ).toContainText('4 items');

    await context.setOffline(false);
    await synced(page);
    const other = await otherDevice(browser);
    await openList(other, title);
    await expect(itemTitles(other)).toHaveText(CLEANED);
    await other.context().close();
  });

  test('refuses a paste over the item limit in the dialog', async ({
    page,
  }) => {
    const dialog = await openNewListDialog(page);
    const lines = Array.from({ length: 2001 }, (_, i) => `Item ${i}`);

    await dialog.getByLabel('Title').fill(unique('Too big'));
    await dialog.getByLabel('Items (one per line)').fill(lines.join('\n'));
    await dialog.getByRole('button', { name: 'Create' }).click();

    await expect(dialog).toContainText('At most 2000 items (you pasted 2001)');
    await expect(dialog).toBeVisible();
  });

  test('an empty items field creates an empty list as before', async ({
    page,
  }) => {
    const title = unique('Plain');
    const dialog = await openNewListDialog(page);

    await dialog.getByLabel('Title').fill(title);
    await dialog.getByRole('button', { name: 'Create' }).click();

    await expect(
      page.getByRole('listitem').filter({ hasText: title }),
    ).toContainText('0 items');
  });
});
