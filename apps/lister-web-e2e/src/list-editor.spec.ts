import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';

const unique = (title: string) =>
  `${title} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Creates a list on the Lists page and opens it. */
async function openNewList(page: Page) {
  const title = unique('Packing');
  await page.goto('/lists');
  await page.getByRole('button', { name: 'New list' }).click();
  const dialog = page.getByRole('dialog', { name: 'New list' });
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('link', { name: title }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: title }),
  ).toBeVisible();
  return title;
}

const items = (page: Page) =>
  page.getByRole('list', { name: 'Items' }).getByRole('listitem');
const itemTitles = (page: Page) => items(page).locator('.title');

async function addItem(page: Page, title: string) {
  const field = page.getByLabel('Add item');
  await field.fill(title);
  await field.press('Enter');
  await expect(field).toHaveValue('');
}

async function paste(page: Page, text: string) {
  await page.getByLabel('Add item').evaluate((input, pasted) => {
    const data = new DataTransfer();
    data.setData('text/plain', pasted);
    input.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, text);
}

/** A laid-out element's box. */
async function box(locator: import('@playwright/test').Locator) {
  const found = await locator.boundingBox();
  if (!found) throw new Error('not laid out');
  return found;
}

async function itemMenu(page: Page, title: string, action: string) {
  await page.getByRole('button', { name: `More for ${title}` }).click();
  await page.getByRole('menuitem', { name: action }).click();
}

test.describe('list editor on a phone (375 px)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('add, paste, edit, delete with undo and reorder items', async ({
    page,
    expectAccessible,
  }) => {
    const title = await openNewList(page);
    await expect(page.getByText('No items yet')).toBeVisible();

    await test.step('add one item', async () => {
      await addItem(page, 'Tent');
      await expect(itemTitles(page)).toHaveText(['Tent']);
    });

    await test.step('paste several lines', async () => {
      await paste(page, 'Sleeping bag\nStove\n\nMatches');
      await expect(itemTitles(page)).toHaveText([
        'Tent',
        'Sleeping bag',
        'Stove',
        'Matches',
      ]);
      await expectAccessible();
    });

    await test.step('edit quantity and note', async () => {
      await itemMenu(page, 'Stove', 'Edit');
      const dialog = page.getByRole('dialog', { name: 'Edit item' });
      // The dialog focuses Title once it has finished opening; filling another field before
      // that would type into Title.
      await expect(dialog.getByLabel('Title')).toBeFocused();
      await dialog.getByLabel('Quantity').fill('2');
      await dialog.getByLabel('Note').fill('with gas');
      await dialog.getByRole('button', { name: 'Save' }).click();
      const stove = items(page).filter({ hasText: 'Stove' });
      await expect(stove).toContainText('with gas');
      await expect(stove.getByLabel('Quantity 2')).toBeVisible();
    });

    await test.step('delete and undo', async () => {
      await itemMenu(page, 'Matches', 'Delete');
      await expect(itemTitles(page)).toHaveText([
        'Tent',
        'Sleeping bag',
        'Stove',
      ]);
      await page.getByRole('button', { name: 'Undo' }).click();
      await expect(itemTitles(page)).toHaveText([
        'Tent',
        'Sleeping bag',
        'Stove',
        'Matches',
      ]);
    });

    await test.step('move up by keyboard; the focus stays on the item', async () => {
      const trigger = page.getByRole('button', { name: 'More for Stove' });
      await trigger.focus();
      await page.keyboard.press('Enter');
      await page.getByRole('menuitem', { name: 'Move up' }).focus();
      await page.keyboard.press('Enter');
      await expect(itemTitles(page)).toHaveText([
        'Tent',
        'Stove',
        'Sleeping bag',
        'Matches',
      ]);
      await expect(trigger).toBeFocused();

      // Back to typing: the next change re-renders the list, and the focus must stay put.
      const field = page.getByLabel('Add item');
      await field.fill('Rope');
      await field.press('Enter');
      await expect(itemTitles(page).last()).toHaveText('Rope');
      await expect(field).toBeFocused();
      await itemMenu(page, 'Rope', 'Delete');
    });

    await test.step('rename an item', async () => {
      await itemMenu(page, 'Tent', 'Edit');
      const dialog = page.getByRole('dialog', { name: 'Edit item' });
      await dialog.getByLabel('Title').fill('Tent (2 people)');
      await dialog.getByRole('button', { name: 'Save' }).click();
      await expect(itemTitles(page).first()).toHaveText('Tent (2 people)');
    });

    await test.step('the list shows its item count', async () => {
      await page.getByRole('link', { name: 'All lists' }).click();
      await expect(
        page.getByRole('listitem').filter({ hasText: title }),
      ).toContainText('4 items');
    });
  });
});

test.describe('list editor on a desktop (1280 px)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('reorders by dragging the handle', async ({
    page,
    expectAccessible,
  }) => {
    await openNewList(page);
    await paste(page, 'A\nB\nC');
    await expect(itemTitles(page)).toHaveText(['A', 'B', 'C']);

    // By exact title: "A" alone would also match icon names such as "drag_indicator".
    const item = (title: string) =>
      items(page).filter({
        has: page.locator('.title', { hasText: new RegExp(`^${title}$`) }),
      });
    const handle = item('A').locator('.handle');
    const target = item('C');
    const from = await box(handle);
    const to = await box(target);
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, to.y + to.height - 4, {
      steps: 12,
    });
    await page.mouse.up();

    await expect(itemTitles(page)).toHaveText(['B', 'C', 'A']);
    await expectAccessible();
  });
});
