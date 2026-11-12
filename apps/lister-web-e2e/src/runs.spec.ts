import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import {
  addItem,
  createList,
  includeList,
  openList,
  otherDevice,
  itemTitles,
  pasteItems,
  synced,
  unique,
} from './support/app';

const checkbox = (page: Page, title: string) =>
  page.getByRole('checkbox', { name: new RegExp(`^${title}\\b`) });

const runLink = (page: Page, title: string | RegExp) =>
  page.getByRole('list', { name: 'Runs' }).getByRole('link', { name: title });

/** A list with items, and an included list sharing one of them. Returns the list's title. */
async function packingList(page: Page) {
  const basics = await createList(page, unique('Basics'));
  await openList(page, basics);
  await pasteItems(page, ['Headlamp', 'Socks']);
  // Local first: wait for the items before navigating away (a reload would drop them).
  await expect(itemTitles(page)).toHaveText(['Headlamp', 'Socks']);
  await synced(page);
  const trip = await createList(page, unique('Trip'));
  await openList(page, trip);
  await pasteItems(page, ['Tent', 'Headlamp']);
  await includeList(page, basics);
  return { trip, basics };
}

for (const [device, viewport] of [
  ['phone', { width: 375, height: 812 }],
  ['desktop', { width: 1280, height: 800 }],
] as const) {
  test.describe(`runs on a ${device}`, () => {
    test.use({ viewport });

    test('start a run from a list, check, skip, move checked items to Done, add items, finish with Undo', async ({
      page,
      expectAccessible,
    }) => {
      test.setTimeout(60_000);
      const { trip, basics } = await packingList(page);

      await test.step('Start run copies the list, merging identical items', async () => {
        await page.getByRole('button', { name: 'Start run' }).click();
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: new RegExp(`^${trip} · `),
          }),
        ).toBeVisible();
        await expect(
          page.getByRole('heading', { level: 2, name: trip }),
        ).toBeVisible();
        await expect(page.getByText(`Also from ${basics}`)).toBeVisible();
        await expect(page.getByText('0 of 3 done')).toBeVisible();
        await expectAccessible();
      });

      await test.step('check, skip, Done section', async () => {
        await checkbox(page, 'Tent').check();
        await expect(page.locator('.checked .title')).toHaveText('Tent');
        await page.getByRole('button', { name: 'More for Socks' }).click();
        await page.getByRole('menuitem', { name: 'Skip' }).click();
        await expect(page.getByText('2 of 3 done')).toBeVisible();
        await page
          .getByRole('switch', { name: 'Move checked items to “Done”' })
          .click();
        await expect(
          page.getByRole('region', { name: 'Done' }).locator('.title'),
        ).toHaveText(['Tent', 'Socks']);
        await page
          .getByRole('switch', { name: 'Move checked items to “Done”' })
          .click();
      });

      await test.step('add an item to this run only', async () => {
        await addItem(page, 'Sunscreen');
        await expect(
          page.getByRole('region', { name: 'Added to this run' }),
        ).toContainText('Sunscreen');
        await expect(page.getByText('2 of 4 done')).toBeVisible();
      });

      const runTitle = (
        await page.getByRole('heading', { level: 1 }).innerText()
      ).trim();

      await test.step('the Runs page shows it with its progress', async () => {
        await page.getByRole('link', { name: 'All runs' }).click();
        await expect(runLink(page, runTitle)).toBeVisible();
        await expectAccessible();
        await runLink(page, runTitle).click();
      });

      await test.step('the last check finishes it; Undo brings it back', async () => {
        await checkbox(page, 'Headlamp').check();
        await checkbox(page, 'Sunscreen').check();
        await expect(page).toHaveURL(/\/runs$/);
        await expect(runLink(page, runTitle)).toHaveCount(0);
        await page.getByRole('button', { name: 'Undo' }).click();
        await expect(runLink(page, runTitle)).toBeVisible();
        await expect(
          page
            .getByRole('list', { name: 'Runs' })
            .getByRole('listitem')
            .filter({ has: page.getByRole('link', { name: runTitle }) }),
        ).toContainText('3 of 4 done');
      });
    });

    test('New run starts an empty ad-hoc run for typed and pasted items', async ({
      page,
      expectAccessible,
    }) => {
      const title = unique('Groceries');
      await page.goto('/runs');
      await page.getByRole('button', { name: 'New run' }).click();
      const dialog = page.getByRole('dialog', { name: 'New run' });
      await dialog.getByLabel('Title').fill(title);
      await dialog.getByRole('button', { name: 'Start' }).click();
      await expect(
        page.getByRole('heading', { level: 1, name: title }),
      ).toBeVisible();
      await expect(page.getByText('No items yet')).toHaveCount(2);

      await addItem(page, 'Milk');
      await pasteItems(page, ['Bread', 'milk']);
      // "milk" is the same item as "Milk" (D16).
      await expect(page.locator('.item .title')).toHaveText(['Milk', 'Bread']);
      await expectAccessible();
    });
  });
}

test('two people check items in the same run live, and both see it disappear when finished', async ({
  page: a,
  browser,
}) => {
  test.setTimeout(60_000);
  const list = await createList(a, unique('Shared'));
  await openList(a, list);
  await addItem(a, 'Tent');
  await addItem(a, 'Stove');
  await a.getByRole('button', { name: 'Start run' }).click();
  const runTitle = (
    await a
      .getByRole('heading', { level: 1, name: new RegExp(`^${list} · `) })
      .innerText()
  ).trim();
  await synced(a);

  const b = await otherDevice(browser);
  await b.goto('/runs');
  await runLink(b, runTitle).click();
  await expect(checkbox(b, 'Tent')).not.toBeChecked();

  await checkbox(a, 'Tent').check();
  await expect(checkbox(b, 'Tent')).toBeChecked();
  await expect(b.getByText('1 of 2 done')).toBeVisible();

  await checkbox(b, 'Stove').check();
  for (const page of [a, b]) {
    await expect(page).toHaveURL(/\/runs$/);
    await expect(runLink(page, runTitle)).toHaveCount(0);
  }
  await expect(a.getByText(`“${runTitle}” is finished`)).toBeVisible();
  await b.context().close();
});
