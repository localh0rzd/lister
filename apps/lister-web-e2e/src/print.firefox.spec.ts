import { expect, test } from '@playwright/test';
import { addItem, createList, openList, unique } from './support/app';
import { printWithFirefox } from './support/print';

// Firefox, printing through the real `window.print()` (silently, to a PDF; `firefox-print`
// project). This is where a window-high shell printed a blank page before and after the sheet.
test('printing a short list and a short run gives one page in Firefox', async ({
  page,
}) => {
  for (const size of [
    { width: 375, height: 740 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(size);
    const title = await createList(page, unique('Firefox print'));
    await openList(page, title);
    await addItem(page, 'Passport');
    await addItem(page, 'Charger');
    expect(await printWithFirefox(page, 'More for this list')).toBe(1);

    await page.getByRole('button', { name: 'Start run' }).click();
    expect(await printWithFirefox(page, 'More for this run')).toBe(1);
  }
});
