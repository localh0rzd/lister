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
