import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { workspaceRoot } from '@nx/devkit';
import { type Page, expect } from '@playwright/test';

/** Pages of a PDF: Chromium and Firefox both write one uncompressed `/Type /Page` per page. */
export function pdfPageCount(pdf: Buffer): number {
  return pdf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g)?.length ?? 0;
}

/**
 * Where Firefox's silent "Save to PDF" writes (`firefox-print` project). Firefox prints through
 * the real `window.print()`, the path where a full-height shell printed blank pages; Chromium's
 * `page.pdf()` never showed them.
 */
export const FIREFOX_PRINT_PDF = join(
  workspaceRoot,
  'tmp/e2e/firefox-print.pdf',
);

export const firefoxPrintPrefs = {
  'print.always_print_silent': true,
  'print.show_print_progress': false,
  print_printer: 'Mozilla Save to PDF',
  'print.printer_Mozilla_Save_to_PDF.print_to_file': true,
  'print.printer_Mozilla_Save_to_PDF.print_to_filename': FIREFOX_PRINT_PDF,
};

/** Prints the page with its Print menu item (Firefox, silently to a PDF) and returns its page count. */
export async function printWithFirefox(page: Page, menu: string) {
  rmSync(FIREFOX_PRINT_PDF, { force: true });
  await page.getByRole('button', { name: menu }).click();
  await page.getByRole('menuitem', { name: 'Print' }).click();
  // Firefox writes the file in the background; it is complete once it ends with %%EOF.
  await expect
    .poll(() => {
      try {
        return readFileSync(FIREFOX_PRINT_PDF, 'latin1')
          .trimEnd()
          .endsWith('%%EOF');
      } catch {
        return false;
      }
    })
    .toBe(true);
  return pdfPageCount(readFileSync(FIREFOX_PRINT_PDF));
}

/**
 * Where the print sheet sits in the print layout: a sheet at the top, with nothing after it,
 * leaves no room for a blank page before or after it.
 */
export async function printLayout(page: Page) {
  await page.emulateMedia({ media: 'print' });
  const layout = await page.evaluate(() => {
    const sheet = document
      .querySelector('lister-print-sheet')!
      .getBoundingClientRect();
    return {
      sheetTop: sheet.top + window.scrollY,
      sheetHeight: sheet.height,
      // The body, not <html>: the root is never shorter than the window.
      spaceAfter: document.body.scrollHeight - (sheet.bottom + window.scrollY),
    };
  });
  await page.emulateMedia({ media: 'screen' });
  return layout;
}
