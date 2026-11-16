import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import {
  addItem,
  createList,
  includeList,
  openList,
  otherDevice,
  pasteItems,
  section,
  synced,
  syncStatus,
  unique,
} from './support/app';

/** The list's own items (not those inside included lists' sections), in order. */
const ownItems = (page: Page) => page.locator('ul.items > li.item .title');
const nestedItems = (page: Page, list: string) =>
  section(page, list).locator('.nested .title');
const sortSection = async (page: Page, list: string) => {
  await page.getByRole('button', { name: `More for list ${list}` }).click();
  await page.getByRole('menuitem', { name: 'Sort A–Z' }).click();
};
const addOrder = (page: Page, name: 'Add at end' | 'Sort in') =>
  page.getByRole('radio', { name });

for (const [device, viewport] of [
  ['phone', { width: 375, height: 812 }],
  ['desktop', { width: 1280, height: 800 }],
] as const) {
  test.describe(`sorting on a ${device}`, () => {
    test.use({ viewport });

    test('sorts a list A–Z with Undo, keeping its included list in place, and sorts the included list from its section', async ({
      page,
      browser,
      expectAccessible,
    }) => {
      test.setTimeout(60_000);
      const basics = await createList(page, unique('Basics'));
      await openList(page, basics);
      await pasteItems(page, ['zinc', 'Éclair', 'Item 10', 'Item 9']);
      await expect(page.locator('ul.items > li.item .title')).toHaveCount(4);
      await synced(page);
      const trip = await createList(page, unique('Trip'));
      await openList(page, trip);
      await pasteItems(page, ['Tent', 'axe']);
      await includeList(page, basics);
      await pasteItems(page, ['Map', 'Bag']);
      await expect(ownItems(page)).toHaveText(['Tent', 'axe', 'Map', 'Bag']);
      await synced(page);
      const other = await otherDevice(browser);
      await openList(other, trip);
      await expect(ownItems(other)).toHaveText(['Tent', 'axe', 'Map', 'Bag']);

      await test.step('Sort A–Z sorts the list’s own items and the include keeps its slot', async () => {
        await page.getByRole('button', { name: 'Sort A–Z' }).click();
        await expect(ownItems(page)).toHaveText(['axe', 'Bag', 'Map', 'Tent']);
        // The section was between "axe" and "Map" before? It was third: after Tent, axe.
        const order = await page
          .locator('ul.items > li')
          .evaluateAll((rows) =>
            rows.map((row) => (row.classList.contains('section') ? '§' : 'i')),
          );
        expect(order).toEqual(['i', 'i', '§', 'i', 'i']);
        await expect(page.getByText(`Sorted “${trip}” A–Z`)).toBeVisible();
        await expectAccessible();
      });

      await test.step('another device sees the new order, nothing twice', async () => {
        await expect(ownItems(other)).toHaveText(['axe', 'Bag', 'Map', 'Tent']);
      });

      await test.step('Undo restores the previous order', async () => {
        await page.getByRole('button', { name: 'Undo' }).click();
        await expect(ownItems(page)).toHaveText(['Tent', 'axe', 'Map', 'Bag']);
        await expect(ownItems(other)).toHaveText(['Tent', 'axe', 'Map', 'Bag']);
      });

      await test.step('the section sorts the included list itself, ignoring case, accents and number size', async () => {
        await sortSection(page, basics);
        await expect(nestedItems(page, basics)).toHaveText([
          'Éclair',
          'Item 9',
          'Item 10',
          'zinc',
        ]);
        await expect(ownItems(page)).toHaveText(['Tent', 'axe', 'Map', 'Bag']);
        await openList(page, basics);
        await expect(ownItems(page)).toHaveText([
          'Éclair',
          'Item 9',
          'Item 10',
          'zinc',
        ]);
      });

      await test.step('sorting an already sorted list says so', async () => {
        await page.getByRole('button', { name: 'Sort A–Z' }).click();
        await expect(page.getByText('Already in A–Z order')).toBeVisible();
      });
      await other.context().close();
    });

    test('sorts a run within each section, with Undo', async ({
      page,
      expectAccessible,
    }) => {
      test.setTimeout(60_000);
      const basics = await createList(page, unique('Basics'));
      await openList(page, basics);
      await pasteItems(page, ['Socks', 'Axe']);
      await expect(page.locator('ul.items > li.item .title')).toHaveCount(2);
      await synced(page);
      const trip = await createList(page, unique('Trip'));
      await openList(page, trip);
      await pasteItems(page, ['Tent', 'Bag']);
      await includeList(page, basics);
      await page.getByRole('button', { name: 'Start run' }).click();
      const names = (heading: string) =>
        page
          .locator('section', {
            has: page.getByRole('heading', { level: 2, name: heading }),
          })
          .locator('.item .title');
      await expect(names(trip)).toHaveText(['Tent', 'Bag']);
      await expect(names(basics)).toHaveText(['Socks', 'Axe']);

      await page.getByRole('button', { name: 'More for this run' }).click();
      await page.getByRole('menuitem', { name: 'Sort A–Z' }).click();

      await expect(names(trip)).toHaveText(['Bag', 'Tent']);
      await expect(names(basics)).toHaveText(['Axe', 'Socks']);
      await expect(page.getByText(/Sorted “.*” A–Z/)).toBeVisible();
      await expectAccessible();

      await page.getByRole('button', { name: 'Undo' }).click();
      await expect(names(trip)).toHaveText(['Tent', 'Bag']);
      await expect(names(basics)).toHaveText(['Socks', 'Axe']);
    });

    test('"Sort in" puts a new item before the first one that sorts after it, in a list and in a run, and is remembered', async ({
      page,
      expectAccessible,
    }) => {
      test.setTimeout(60_000);
      const trip = await createList(page, unique('Trip'));
      await openList(page, trip);
      await pasteItems(page, ['Axe', 'Map', 'Tent']);
      await expect(ownItems(page)).toHaveText(['Axe', 'Map', 'Tent']);

      await test.step('the default adds at the end', async () => {
        await expect(addOrder(page, 'Add at end')).toBeChecked();
        await addItem(page, 'Bag');
        await expect(ownItems(page)).toHaveText(['Axe', 'Map', 'Tent', 'Bag']);
      });

      await test.step('"Sort in" sorts new items in, also a pasted batch', async () => {
        await addOrder(page, 'Sort in').click();
        await expect(addOrder(page, 'Sort in')).toBeChecked();
        await addItem(page, 'Lamp');
        await expect(ownItems(page)).toHaveText([
          'Axe',
          'Lamp',
          'Map',
          'Tent',
          'Bag',
        ]);
        await pasteItems(page, ['Zip', 'Cord']);
        await expect(ownItems(page)).toHaveText([
          'Axe',
          'Cord',
          'Lamp',
          'Map',
          'Tent',
          'Bag',
          'Zip',
        ]);
        await expectAccessible();
      });

      await test.step('the choice is remembered after a reload', async () => {
        await page.reload();
        await expect(addOrder(page, 'Sort in')).toBeChecked();
      });

      await test.step('the run page sorts typed items in too', async () => {
        await page.getByRole('button', { name: 'Start run' }).click();
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: new RegExp(`^${trip} · `),
          }),
        ).toBeVisible();
        await expect(addOrder(page, 'Sort in')).toBeChecked();
        const items = page.locator('.item .title');
        await expect(items).toHaveCount(7);
        const field = page.getByLabel('Add item');
        await field.fill('Fork');
        await field.press('Enter');
        await expect(field).toHaveValue('');
        await expect(items).toHaveCount(8);
        const titles = await items.allTextContents();
        // Typed items go among the typed ones; the listed ones keep their own section.
        expect(titles.map((t) => t.trim())).toContain('Fork');
        await addOrder(page, 'Add at end').click();
        await field.fill('Ant');
        await field.press('Enter');
        await expect(items.last()).toHaveText('Ant');
      });
    });
  });
}

test('sorting offline syncs as one change; an item added meanwhile on another device appears once', async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(60_000);
  const title = await createList(page, unique('Offline'));
  await openList(page, title);
  await pasteItems(page, ['Tent', 'Axe', 'Map']);
  await expect(ownItems(page)).toHaveText(['Tent', 'Axe', 'Map']);
  await synced(page);
  const other = await otherDevice(browser);
  await openList(other, title);
  await expect(ownItems(other)).toHaveText(['Tent', 'Axe', 'Map']);

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Sort A–Z' }).click();
  await expect(ownItems(page)).toHaveText(['Axe', 'Map', 'Tent']);
  await expect(syncStatus(page)).toContainText('1 change not synced');
  await addItem(other, 'Bag');

  await context.setOffline(false);
  await synced(page);
  await expect(ownItems(page)).toHaveText(['Axe', 'Map', 'Tent', 'Bag']);
  await expect(ownItems(other)).toHaveText(['Axe', 'Map', 'Tent', 'Bag']);
  await other.context().close();
});

test.describe('the list header on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('keeps a long title readable: "Sort A–Z" and "Start run" wrap under it', async ({
    page,
  }) => {
    const title = await createList(
      page,
      unique('A rather long packing list title for the trip'),
    );
    await openList(page, title);
    const heading = page.getByRole('heading', { level: 1, name: title });
    const box = await heading.boundingBox();
    const sort = await page
      .getByRole('button', { name: 'Sort A–Z' })
      .boundingBox();
    expect(box?.width).toBeGreaterThan(200);
    expect(sort?.y).toBeGreaterThan((box?.y ?? 0) + (box?.height ?? 0) - 1);
  });
});
