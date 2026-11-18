import { expect, test } from './support/fixtures';
import {
  addItem,
  createList,
  includeList,
  openList,
  section,
  unique,
} from './support/app';

for (const [device, viewport] of [
  ['phone', { width: 375, height: 812 }],
  ['desktop', { width: 1280, height: 800 }],
] as const) {
  test.describe(`composition on a ${device}`, () => {
    test.use({ viewport });

    test('include lists, edit through a section, remove with Undo, see a trashed list', async ({
      page,
      expectAccessible,
    }) => {
      // A long flow of many steps; under the full suite's parallel load it needs more than 30 s.
      test.setTimeout(60_000);
      const trip = await createList(page, unique('Trip'));
      const camping = await createList(page, unique('Camping'));
      const toiletries = await createList(page, unique('Toiletries'));
      await openList(page, camping);
      await addItem(page, 'Tent');
      await openList(page, toiletries);
      await addItem(page, 'Soap');

      await test.step('Trip includes Camping', async () => {
        await openList(page, trip);
        await page.getByRole('button', { name: 'Add list' }).click();
        const picker = page.getByRole('dialog', { name: 'Add list' });
        // The list itself is never offered.
        await picker.getByLabel('Search lists').fill(trip);
        await expect(picker.getByText(/No list matches/)).toBeVisible();
        await picker.getByRole('button', { name: 'Cancel' }).click();

        await includeList(page, camping);
        await expect(section(page, camping)).toContainText('Tent');
        await expectAccessible();
      });

      await test.step('Camping includes Toiletries; Trip would loop', async () => {
        await openList(page, camping);
        await page.getByRole('button', { name: 'Add list' }).click();
        const picker = page.getByRole('dialog', { name: 'Add list' });
        await picker.getByLabel('Search lists').fill(trip);
        await expect(picker.getByText(/No list matches/)).toBeVisible();
        await picker.getByRole('button', { name: 'Cancel' }).click();
        await includeList(page, toiletries);
      });

      await test.step('nested in Trip, and editing Soap edits Toiletries', async () => {
        await openList(page, trip);
        const campingSection = section(page, camping);
        await expect(campingSection).toContainText(toiletries);
        await expect(campingSection).toContainText('Soap');

        await campingSection
          .getByRole('button', { name: 'More for Soap' })
          .click();
        await page.getByRole('menuitem', { name: /Edit/ }).click();
        const dialog = page.getByRole('dialog', { name: 'Edit item' });
        await expect(dialog).toContainText(
          `Changes “${toiletries}”, also used in 1 other list`,
        );
        await expect(dialog.getByLabel('Title')).toBeFocused();
        await dialog.getByLabel('Title').fill('Olive soap');
        await dialog.getByRole('button', { name: 'Save' }).click();
        await expect(campingSection).toContainText('Olive soap');

        await openList(page, toiletries);
        await expect(
          page.getByRole('list', { name: 'Items' }).locator('.title'),
        ).toHaveText(['Olive soap']);
      });

      await test.step('remove the section, then Undo', async () => {
        await openList(page, trip);
        await page
          .getByRole('button', { name: `More for list ${camping}` })
          .click();
        await page
          .getByRole('menuitem', { name: 'Remove from this list' })
          .click();
        await expect(section(page, camping)).toBeHidden();
        await page.getByRole('button', { name: 'Undo' }).click();
        await expect(section(page, camping)).toContainText('Tent');
      });

      await test.step('a list in the trash shows as a placeholder', async () => {
        await page.goto('/lists');
        await page
          .getByRole('button', { name: `More for ${toiletries}` })
          .click();
        await page.getByRole('menuitem', { name: 'Delete' }).click();
        await expect(page.getByRole('link', { name: toiletries })).toBeHidden();
        await openList(page, camping);
        await expect(section(page, 'Deleted list')).toContainText(
          'This list is in the trash.',
        );
        await expectAccessible();
      });
    });
  });
}
