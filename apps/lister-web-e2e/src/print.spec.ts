import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import {
  addItem,
  createList,
  itemTitles,
  openList,
  pasteItems,
  unique,
} from './support/app';
import { pdfPageCount, printLayout } from './support/print';

/** Pages of the PDF Chromium prints from the page's print media. */
async function printedPages(page: Page, format: 'A4' | 'Letter' = 'A4') {
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ format, preferCSSPageSize: false });
  await page.emulateMedia({ media: 'screen' });
  return pdfPageCount(pdf);
}

/** The sheet is first in the print layout and nothing after it takes space. */
async function expectSheetAlone(page: Page) {
  const { sheetTop, spaceAfter } = await printLayout(page);
  expect(sheetTop).toBe(0);
  // Below a pixel: scrollHeight is rounded to whole pixels.
  expect(spaceAfter).toBeLessThan(1);
}

const layouts = [
  { name: 'phone', size: { width: 375, height: 1800 } },
  { name: 'wide', size: { width: 1280, height: 1800 } },
];

test.describe('printing without blank pages', () => {
  for (const { name, size } of layouts) {
    test(`${name}: a short list and a short run are one page, a long list needs as many as its items`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await page.setViewportSize(size);
      const title = await createList(page, unique('Print'));
      await openList(page, title);
      await addItem(page, 'Passport');
      await addItem(page, 'Charger');

      // The shell takes up no space of its own: it is as tall as the sheet, not the window (a
      // window-high shell, with its own scrolling content, is what printed blank pages).
      await page.emulateMedia({ media: 'print' });
      const shell = await page.locator('.shell').evaluate((el) => {
        const content = getComputedStyle(el.querySelector('.content')!);
        return {
          height: el.getBoundingClientRect().height,
          overflow: content.overflow,
          padding: content.padding,
        };
      });
      expect(shell.height).toBeLessThan(400);
      expect(shell.overflow).toBe('visible');
      expect(shell.padding).toBe('0px');
      await page.emulateMedia({ media: 'screen' });

      // A short list: one page, and the sheet is all there is on it.
      await expectSheetAlone(page);
      expect(await printedPages(page)).toBe(1);
      expect(await printedPages(page, 'Letter')).toBe(1);

      // A short run.
      await page.getByRole('button', { name: 'Start run' }).click();
      await expect(
        page.getByRole('button', { name: 'More for this run' }),
      ).toBeVisible();
      await expectSheetAlone(page);
      expect(await printedPages(page)).toBe(1);

      // A long list: the page count follows from the sheet's height, 15 mm margins on A4.
      await openList(page, title);
      await expect(itemTitles(page)).toHaveText(['Passport', 'Charger']);
      await pasteItems(
        page,
        Array.from({ length: 60 }, (_, i) => `Item ${i + 1}`),
      );
      await expect(itemTitles(page)).toHaveCount(62, { timeout: 60_000 });
      await expectSheetAlone(page);
      const { sheetHeight } = await printLayout(page);
      const pageHeight = ((297 - 30) / 25.4) * 96;
      const pages = await printedPages(page);
      expect(pages).toBe(Math.ceil(sheetHeight / pageHeight));
      expect(pages).toBeGreaterThan(1);
    });
  }

  test('a theme picked in Settings still prints on a light page', async ({
    page,
  }) => {
    await createList(page, unique('Print dark'));
    await page.evaluate(() => localStorage.setItem('lister.theme', 'dark'));
    await page.reload();
    const scheme = () =>
      page.evaluate(
        () => getComputedStyle(document.documentElement).colorScheme,
      );
    expect(await scheme()).toBe('dark');
    // The chosen theme is an inline style on <html>; on paper it must not paint a dark page.
    await page.emulateMedia({ media: 'print' });
    expect(await scheme()).toBe('light');
    await page.emulateMedia({ media: 'screen' });
    expect(await scheme()).toBe('dark');
    await page.evaluate(() => localStorage.removeItem('lister.theme'));
  });
});
