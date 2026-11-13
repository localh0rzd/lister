import { type Browser, type Page, expect, test } from '@playwright/test';

/** Unique titles: every test in a run shares the e2e database. */
export const unique = (title: string) =>
  `${title} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * A second device of the same signed-in user: a fresh browser context (own IndexedDB, own socket)
 * with the project's session cookie.
 */
export async function otherDevice(browser: Browser) {
  const { storageState, baseURL } = test.info().project.use;
  return (await browser.newContext({ storageState, baseURL })).newPage();
}

/** Creates a list on the Lists page and returns its title. */
export async function createList(page: Page, title = unique('Sync')) {
  await page.goto('/lists');
  await page.getByRole('button', { name: 'New list' }).click();
  const dialog = page.getByRole('dialog', { name: 'New list' });
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('link', { name: title })).toBeVisible();
  return title;
}

/** Opens a list from the Lists page. */
export async function openList(page: Page, title: string) {
  await page.goto('/lists');
  await page.getByRole('link', { name: title }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: title }),
  ).toBeVisible();
}

export const itemTitles = (page: Page) =>
  page
    .getByRole('list', { name: 'Items' })
    .getByRole('listitem')
    .locator('.title');

export async function addItem(page: Page, title: string) {
  const field = page.getByLabel('Add item');
  await field.fill(title);
  await field.press('Enter');
  await expect(field).toHaveValue('');
}

/** Pastes several lines into the add field (one item per line). */
export async function pasteItems(page: Page, titles: string[]) {
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
  }, titles.join('\n'));
}

export async function itemMenu(page: Page, title: string, action: string) {
  await page.getByRole('button', { name: `More for ${title}` }).click();
  await page.getByRole('menuitem', { name: action }).click();
}

export async function editItemTitle(page: Page, from: string, to: string) {
  await itemMenu(page, from, 'Edit');
  const dialog = page.getByRole('dialog', { name: 'Edit item' });
  await dialog.getByLabel('Title').fill(to);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
}

/** The sync badge, wherever the layout puts it (top app bar or rail). */
export const syncStatus = (page: Page) =>
  page
    .getByRole('banner')
    .or(page.locator('lister-navigation-rail'))
    .getByRole('status');

/** Waits until this device has nothing left to sync. */
export async function synced(page: Page) {
  await expect(syncStatus(page)).not.toContainText(/not synced|Offline/);
}

/** True once the service worker has cached the app shell and the icon font. */
export function shellIsCached(page: Page) {
  return page.evaluate(async () => {
    const urls = new Set<string>();
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys()) {
        urls.add(new URL(request.url).pathname);
      }
    }
    return (
      ['/index.html', '/manifest.webmanifest'].every((url) => urls.has(url)) &&
      [...urls].some((url) => url.includes('material-symbols-outlined'))
    );
  });
}

/** "Add list" in the open list editor: picks `title` in the picker. */
export async function includeList(page: Page, title: string) {
  await page.getByRole('button', { name: 'Add list' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add list' });
  await expect(dialog.getByLabel('Search lists')).toBeFocused();
  await dialog.getByLabel('Search lists').fill(title);
  await dialog.getByRole('button', { name: title, exact: true }).click();
  await expect(dialog).toBeHidden();
  // The change is local first: wait for it before navigating away (a reload would drop it).
  await expect(section(page, title)).toBeVisible();
}

/** An included list's section in the open list editor. */
export const section = (page: Page, title: string) =>
  page.getByRole('listitem', { name: `List ${title}`, exact: true });
