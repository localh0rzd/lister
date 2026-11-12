import { expect, test } from './support/fixtures';

// M3 surface colours of the #00796B theme (THEME_SURFACE in @lister/web/util-theme).
const surface = {
  light: { hex: '#f6faf8', rgb: 'rgb(246, 250, 248)' },
  dark: { hex: '#101413', rgb: 'rgb(16, 20, 19)' },
};

const bodyBackground = (page: import('@playwright/test').Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

const themeColors = (page: import('@playwright/test').Page) =>
  page
    .locator('meta[name="theme-color"]')
    .evaluateAll((metas) => metas.map((m) => (m as HTMLMetaElement).content));

test.describe('theme', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`follows the system ${scheme} scheme`, async ({
      page,
      expectAccessible,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/');

      await expect(page.getByRole('radio', { name: 'System' })).toBeChecked();
      await expect.poll(() => bodyBackground(page)).toBe(surface[scheme].rgb);
      expect(await themeColors(page)).toEqual([
        surface.light.hex,
        surface.dark.hex,
      ]);
      await expectAccessible();
    });
  }

  test('remembers a manual choice on the device', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');

    await page.getByRole('radio', { name: 'Dark' }).click();
    await expect.poll(() => bodyBackground(page)).toBe(surface.dark.rgb);
    expect(await themeColors(page)).toEqual([
      surface.dark.hex,
      surface.dark.hex,
    ]);

    await page.reload();
    await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(await bodyBackground(page)).toBe(surface.dark.rgb);

    await page.getByRole('radio', { name: 'System' }).click();
    await expect.poll(() => bodyBackground(page)).toBe(surface.light.rgb);
  });

  test('self-hosts Roboto and Material Symbols', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (request) => {
      const { hostname } = new URL(request.url());
      if (hostname !== 'localhost' && hostname !== '127.0.0.1')
        external.push(request.url());
    });

    await page.goto('/');
    await expect(page.getByText('dark_mode')).toBeVisible();
    const loadedFonts = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts]
        .filter((font) => font.status === 'loaded')
        .map((font) => font.family.replaceAll('"', ''));
    });

    expect(loadedFonts).toEqual(
      expect.arrayContaining(['Roboto Variable', 'Material Symbols Outlined']),
    );
    expect(external).toEqual([]);
  });
});
