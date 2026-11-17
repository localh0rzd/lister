import { readFile, writeFile } from 'node:fs/promises';
import { expect, test } from './support/fixtures';
import {
  addItem,
  createList,
  includeList,
  itemTitles,
  openList,
  unique,
} from './support/app';

test.describe('export, import and print', () => {
  test('exports a list as JSON, imports it as a copy and prints it', async ({
    page,
    expectAccessible,
  }, testInfo) => {
    test.setTimeout(60_000);
    const camping = await createList(page, unique('Camping'));
    const basics = await createList(page, unique('Basics'));
    await openList(page, basics);
    await addItem(page, 'Passport');
    await openList(page, camping);
    await addItem(page, 'Tent');
    await includeList(page, basics);
    await addItem(page, 'Stove');

    // Export as JSON from the list's menu: a file named after the list.
    await page.getByRole('button', { name: 'More for this list' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Export as JSON' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(`${camping}.json`);
    const path = testInfo.outputPath(file.suggestedFilename());
    await file.saveAs(path);
    const exported = JSON.parse(await readFile(path, 'utf8'));
    expect(exported.lists.map((l: { title: string }) => l.title)).toEqual([
      camping,
      basics,
    ]);

    // Print view: only the sheet, grouped by included list, without the navigation.
    await page.emulateMedia({ media: 'print' });
    const sheet = page.locator('lister-print-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('heading', { level: 1 })).toHaveText(camping);
    await expect(sheet.getByRole('heading', { level: 2 })).toHaveText(basics);
    await expect(sheet.getByRole('listitem')).toHaveText(
      ['Tent', 'Stove', 'Passport'].map((title) => new RegExp(title)),
    );
    await expect(page.getByRole('list', { name: 'Items' })).toBeHidden();
    await expect(
      page.locator('lister-navigation-rail, lister-navigation-bar'),
    ).toBeHidden();
    await page.emulateMedia({ media: 'screen' });

    // Import it again: new copies of both lists, next to the originals.
    await page.goto('/lists');
    await expectAccessible();
    await page.locator('input[type="file"]').setInputFiles(path);
    await expect(page.getByText('Imported 2 lists')).toBeVisible();
    await expect(page.getByRole('link', { name: camping })).toHaveCount(2);
    await expect(page.getByRole('link', { name: basics })).toHaveCount(2);

    // The copy is a list of its own, with its own include.
    await page.getByRole('link', { name: camping }).last().click();
    await expect(
      page.getByRole('list', { name: 'Items' }).locator('.item .title'),
    ).toHaveText(['Tent', 'Stove']);
    await expect(
      page.getByRole('listitem', { name: `List ${basics}` }),
    ).toContainText('Passport');
  });

  test('imports a Markdown file as one new list and refuses a file that is not an export', async ({
    page,
  }, testInfo) => {
    const title = unique('Trip');
    const markdown = testInfo.outputPath('trip.md');
    await writeFile(markdown, `# ${title}\n\n- [ ] Socks\n- [x] Boots\n`);
    const other = testInfo.outputPath('other.json');
    await writeFile(other, '{"hello":"world"}');
    await page.goto('/lists');

    await page.locator('input[type="file"]').setInputFiles(other);
    await expect(page.getByText("This isn't a Lister export")).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles(markdown);
    await page.getByRole('button', { name: 'Open' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: title }),
    ).toBeVisible();
    await expect(itemTitles(page)).toHaveText(['Socks', 'Boots']);
  });

  test('exports every list from the Space page', async ({ page }, testInfo) => {
    const title = await createList(page, unique('Everything'));
    await page.goto('/space');

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export all lists/ }).click();
    const file = await download;
    const path = testInfo.outputPath('all.json');
    await file.saveAs(path);

    expect(await readFile(path, 'utf8')).toContain(title);
  });

  test('on a phone: imports a text file and prints a run without the top bar and bottom navigation', async ({
    page,
    expectAccessible,
  }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 700 });
    const title = unique('Phone');
    const text = testInfo.outputPath('phone.txt');
    await writeFile(text, `${title}\nSocks\nBoots\n`);
    await page.goto('/lists');
    await expectAccessible();

    await page.locator('input[type="file"]').setInputFiles(text);
    await page.getByRole('button', { name: 'Open' }).click();
    await expect(page.getByRole('heading', { name: 'phone' })).toBeVisible();
    await expect(itemTitles(page)).toHaveText([title, 'Socks', 'Boots']);

    await page.getByRole('button', { name: 'Start run' }).click();
    await page.getByRole('button', { name: 'More for this run' }).click();
    await expect(page.getByRole('menuitem', { name: 'Print' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('lister-print-sheet')).toContainText('Socks');
    await expect(page.locator('lister-print-sheet')).toContainText('☐');
    await expect(page.getByRole('banner')).toBeHidden();
    await expect(page.locator('lister-navigation-bar')).toBeHidden();
  });
});
