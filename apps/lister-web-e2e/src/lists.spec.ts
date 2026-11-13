import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { otherDevice } from './support/app';

/** Unique titles: every test in a run shares the e2e database. */
const unique = (title: string) =>
  `${title} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Opens Lists and waits until the space has arrived from the server ("New list" appears). */
async function openLists(page: Page) {
  await page.goto('/lists');
  await expect(page.getByRole('button', { name: 'New list' })).toBeVisible();
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

test.describe('offline on a phone (375 px)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('a list made offline shows as not synced, then syncs', async ({
    page,
    context,
    browser,
  }) => {
    const title = unique('Offline');
    await openLists(page);
    const status = page.getByRole('banner').getByRole('status');

    await context.setOffline(true);
    await expect(status).toContainText('Offline');
    await createList(page, title);
    await expect(row(page, title)).toBeVisible();
    await expect(status).toContainText('Offline · 1 change not synced');

    await context.setOffline(false);
    await expect(status).not.toContainText('Offline');
    await expect(status).not.toContainText('not synced');

    const other = await otherDevice(browser);
    await openLists(other);
    await expect(row(other, title)).toBeVisible();
    await other.context().close();
  });
});

test.describe('lists on a desktop (1280 px)', () => {
  test('the rail tells screen readers the whole sync state', async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openLists(page);

    await context.setOffline(true);
    const status = page.locator('lister-navigation-rail').getByRole('status');
    await expect(status).toContainText('Offline');
    await createList(page, unique('Rail'));
    await expect(status).toContainText('Offline · 1 change not synced');
    await context.setOffline(false);
    await expect(status).not.toContainText('not synced');
  });

  test.use({ viewport: { width: 1280, height: 800 } });

  test('a change appears on another device without a reload', async ({
    page,
    browser,
    expectAccessible,
  }) => {
    const other = await otherDevice(browser);
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

test.describe('truncated list titles on a phone (375 px)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('a cut-off title shows its full text in a tooltip, a short one does not', async ({
    page,
    expectAccessible,
  }) => {
    const long = unique(
      'A very long list title that cannot possibly fit on a phone screen in one line',
    );
    const short = unique('Short');
    await openLists(page);
    await createList(page, long);
    await createList(page, short);

    await test.step('hover on the long title', async () => {
      await row(page, long).getByRole('link').hover();
      await expect(page.locator('.mat-mdc-tooltip')).toHaveText(long);
      await expectAccessible();
    });

    await test.step('keyboard focus on the long title', async () => {
      await page.mouse.move(0, 0);
      await expect(page.locator('.mat-mdc-tooltip')).toHaveCount(0);
      // Tab from the row's menu button back to the title: a keyboard focus, which shows tooltips.
      await row(page, long).getByRole('button').focus();
      await page.keyboard.press('Shift+Tab');
      await expect(row(page, long).getByRole('link')).toBeFocused();
      await expect(page.locator('.mat-mdc-tooltip')).toHaveText(long);
    });

    await test.step('no tooltip for a title that fits', async () => {
      await page.keyboard.press('Escape');
      await row(page, short).getByRole('link').hover();
      // Material shows a tooltip from a timer: let it run before asserting there is none.
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      await expect(page.locator('.mat-mdc-tooltip')).toHaveCount(0);
    });
  });
});

test.describe('truncated titles in the list picker (375 px)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('a cut-off list title in "Add list" shows its full text in a tooltip', async ({
    page,
    expectAccessible,
  }) => {
    const shared = 'Motorcycle vacation in the Alps with a long title';
    const long = unique(`${shared} that ends differently`);
    const host = unique('Trip');
    await openLists(page);
    await createList(page, long);
    await createList(page, host);
    await row(page, host).getByRole('link').click();
    await page.getByRole('button', { name: 'Add list' }).click();
    const picker = page.getByRole('dialog', { name: 'Add list' });
    await picker.getByLabel('Search lists').fill(long);

    await picker.getByRole('button', { name: long }).hover();
    await expect(page.locator('.mat-mdc-tooltip')).toHaveText(long);
    await expectAccessible();
  });
});

test.describe('truncated list titles on a touch phone', () => {
  test.use({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  });

  test('a long-press shows the full title, and swiping on it still scrolls', async ({
    page,
  }) => {
    const long = unique(
      'A very long list title that cannot possibly fit on a phone screen in one line',
    );
    await openLists(page);
    await createList(page, long);
    const link = row(page, long).getByRole('link');
    await link.scrollIntoViewIfNeeded();

    // A touch that starts on the title may scroll the page (no touch-action: none).
    await expect(link).not.toHaveCSS('touch-action', 'none');

    const point = await link.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return { x: box.x + 20, y: box.y + box.height / 2 };
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [point],
    });
    await expect(page.locator('.mat-mdc-tooltip')).toHaveText(long);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    // The press was for reading the title, not for opening the list.
    await expect(page).toHaveURL(/\/lists$/);
    await expect(page.locator('.mat-mdc-tooltip')).toHaveCount(0);
  });
});
