import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';

/** Unique per test run, because the e2e database keeps data between runs. */
const unique = (title: string) =>
  `${title} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Opens Lists and waits until the space has arrived from the server. */
async function openLists(page: Page) {
  await page.goto('/lists');
  await expect(page.getByRole('list', { name: 'Lists' })).toBeVisible();
}

const row = (page: Page, title: string) =>
  page.getByRole('listitem').filter({ hasText: title });

async function createList(page: Page, title: string) {
  await page.getByRole('button', { name: 'New list' }).click();
  const dialog = page.getByRole('dialog', { name: 'New list' });
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog).toBeHidden();
}

async function menuAction(
  page: Page,
  title: string,
  action: 'Rename' | 'Delete',
) {
  await page.getByRole('button', { name: `More for ${title}` }).click();
  await page.getByRole('menuitem', { name: action }).click();
}

test.describe('lists on a phone (375 px)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('create, rename, delete and undo a list', async ({
    page,
    expectAccessible,
  }) => {
    const title = unique('Camping');
    const renamed = unique('Camping trip');
    await openLists(page);

    await test.step('create', async () => {
      await createList(page, title);
      await expect(row(page, title)).toContainText('0 items');
      await expectAccessible();
    });

    await test.step('rename', async () => {
      await menuAction(page, title, 'Rename');
      const dialog = page.getByRole('dialog', { name: 'Rename list' });
      await expect(dialog.getByLabel('Title')).toHaveValue(title);
      await dialog.getByLabel('Title').fill(renamed);
      await dialog.getByRole('button', { name: 'Rename' }).click();
      await expect(row(page, renamed)).toBeVisible();
      await expect(row(page, title)).toHaveCount(0);
    });

    await test.step('delete and undo', async () => {
      await menuAction(page, renamed, 'Delete');
      await expect(row(page, renamed)).toHaveCount(0);
      await page.getByRole('button', { name: 'Undo' }).click();
      await expect(row(page, renamed)).toBeVisible();
    });

    await test.step('delete for good', async () => {
      await menuAction(page, renamed, 'Delete');
      await expect(row(page, renamed)).toHaveCount(0);
      await expect(page.getByText(`Deleted “${renamed}”`)).toBeVisible();
    });
  });

  test('refuses an empty title in the dialog', async ({ page }) => {
    await openLists(page);
    await page.getByRole('button', { name: 'New list' }).click();
    const dialog = page.getByRole('dialog', { name: 'New list' });

    await dialog.getByRole('button', { name: 'Create' }).click();

    await expect(dialog.getByText('A title is required')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  });
});

test.describe('lists on a desktop (1280 px)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('a change appears on another device without a reload', async ({
    page,
    browser,
    expectAccessible,
  }) => {
    const other = await (await browser.newContext()).newPage();
    const title = unique('Hiking');
    await openLists(page);
    await openLists(other);

    await createList(page, title);
    await expect(row(other, title)).toContainText('0 items');

    await menuAction(other, title, 'Rename');
    const dialog = other.getByRole('dialog', { name: 'Rename list' });
    await dialog.getByLabel('Title').fill(`${title}!`);
    await dialog.getByRole('button', { name: 'Rename' }).click();
    await expect(row(page, `${title}!`)).toBeVisible();

    await menuAction(page, `${title}!`, 'Delete');
    await expect(row(other, `${title}!`)).toHaveCount(0);
    await expectAccessible();
    await other.context().close();
  });
});
