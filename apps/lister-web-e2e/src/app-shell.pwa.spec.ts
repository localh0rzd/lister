import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';

/** True once the service worker has cached the app shell and the icon font. */
function shellIsCached(page: Page) {
  return page.evaluate(async () => {
    const wanted = ['/index.html', '/manifest.webmanifest'];
    const names = await caches.keys();
    const urls = new Set<string>();
    for (const name of names) {
      for (const request of await (await caches.open(name)).keys()) {
        urls.add(new URL(request.url).pathname);
      }
    }
    return (
      wanted.every((url) => urls.has(url)) &&
      [...urls].some((url) => url.includes('material-symbols-outlined'))
    );
  });
}

test.describe('installable PWA (production build)', () => {
  test('loads offline after one online visit', async ({ page, context }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Lists' }),
    ).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect
      .poll(() => shellIsCached(page), { timeout: 60_000 })
      .toBe(true);

    await context.setOffline(true);
    await page.reload();

    await expect(
      page.getByRole('heading', { level: 1, name: 'Lists' }),
    ).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Runs' })
      .click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Runs' }),
    ).toBeVisible();
    const iconFontLoaded = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].some(
        (font) =>
          font.family.includes('Material Symbols Outlined') &&
          font.status === 'loaded',
      );
    });
    expect(iconFontLoaded).toBe(true);
  });

  test('offers a new version and reloads into it', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect
      .poll(() => shellIsCached(page), { timeout: 60_000 })
      .toBe(true);
    // The first visit isn't controlled by the worker yet; the update check needs it.
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
      .toBe(true);

    // Publish a "new" version: the same files under a different manifest timestamp, which
    // changes the version hash. Chromium routes the service worker's own fetches too.
    await context.route('**/ngsw.json*', async (route) => {
      const response = await route.fetch();
      const manifest = await response.json();
      await route.fulfill({
        response,
        json: { ...manifest, timestamp: manifest.timestamp + 1 },
      });
    });
    await page.evaluate(() => {
      (window as unknown as { beforeUpdate: boolean }).beforeUpdate = true;
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await expect(page.getByText('New version available')).toBeVisible({
      timeout: 30_000,
    });
    // The reload runs once the snackbar has closed.
    await Promise.all([
      page.waitForEvent('load'),
      page.getByRole('button', { name: 'Reload' }).click(),
    ]);

    await expect(
      page.getByRole('heading', { level: 1, name: 'Lists' }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => (window as unknown as { beforeUpdate?: boolean }).beforeUpdate,
      ),
    ).toBeUndefined();
  });

  test('has a manifest with name, scope, colours and icons', async ({
    page,
    request,
  }) => {
    await page.goto('/');
    const href = await page
      .locator('link[rel="manifest"]')
      .getAttribute('href');
    const manifest = await (await request.get(`/${href}`)).json();

    expect(manifest).toMatchObject({
      name: 'Lister',
      short_name: 'Lister',
      display: 'standalone',
      start_url: '/',
      scope: '/',
      theme_color: '#f6faf8',
      background_color: '#f6faf8',
    });
    const icons = manifest.icons as {
      src: string;
      sizes: string;
      purpose: string;
    }[];
    for (const purpose of ['any', 'maskable']) {
      for (const size of ['192x192', '512x512']) {
        expect(icons).toContainEqual(
          expect.objectContaining({ sizes: size, purpose }),
        );
      }
    }
    for (const icon of icons) {
      const [width] = icon.sizes.split('x').map(Number);
      const naturalWidth = await page.evaluate(async (src) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        return image.naturalWidth;
      }, `/${icon.src}`);
      expect(naturalWidth, icon.src).toBe(width);
    }
  });
});

test.describe('one origin (production setup)', () => {
  test('the app, the API and the sync socket share the origin', async ({
    page,
    baseURL,
  }) => {
    const title = `Prod ${Date.now().toString(36)}`;
    const origins = new Set<string>();
    page.on('request', (request) => origins.add(new URL(request.url()).origin));

    await page.goto('/lists');
    await expect(page.getByRole('button', { name: 'New list' })).toBeVisible();
    await page.getByRole('button', { name: 'New list' }).click();
    const dialog = page.getByRole('dialog', { name: 'New list' });
    await dialog.getByLabel('Title').fill(title);
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('link', { name: title })).toBeVisible();

    // It reached the server: a reload (served by the API) still shows it once synced.
    await expect(
      page
        .getByRole('banner')
        .or(page.locator('lister-navigation-rail'))
        .getByRole('status'),
    ).not.toContainText('not synced');
    await page.reload();
    await expect(page.getByRole('link', { name: title })).toBeVisible();
    expect([...origins]).toEqual([new URL(String(baseURL)).origin]);
  });

  test('deep links load the app, and the API is not the app', async ({
    page,
    request,
  }) => {
    await page.goto('/lists/0190a000-0000-7000-8000-000000000001');
    await expect(
      page.getByRole('heading', { level: 1, name: 'List not found' }),
    ).toBeVisible();

    const api = await request.get('/api/nope', {
      headers: { accept: 'text/html' },
    });
    expect(api.status()).toBe(404);
    expect(await api.text()).not.toContain('<lister-root');
  });
});
