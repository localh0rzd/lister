import { expect, test } from './support/fixtures';
import {
  addItem,
  createList,
  itemTitles,
  openList,
  unique,
} from './support/app';

for (const [device, viewport] of [
  ['phone', { width: 320, height: 568 }],
  ['desktop', { width: 1280, height: 800 }],
] as const) {
  test.describe(`item autocomplete on a ${device}`, () => {
    test.use({ viewport });

    test('adds an item to a list by choosing a suggestion, with the keyboard or a tap', async ({
      page,
      expectAccessible,
    }) => {
      const stove = unique('Stove');
      const camping = await createList(page, unique('Camping'));
      const trip = await createList(page, unique('Trip'));
      await openList(page, camping);
      await addItem(page, stove);
      await addItem(page, `${stove} gas`);
      await openList(page, trip);

      const field = page.getByLabel('Add item');
      await field.fill(stove.toLowerCase().slice(0, -3));
      const options = page.getByRole('option');
      await expect(options).toHaveText([stove, `${stove} gas`]);
      await expectAccessible();

      // Arrow keys and Enter choose the second suggestion.
      await field.press('ArrowDown');
      await field.press('ArrowDown');
      await field.press('Enter');
      const titles = itemTitles(page);
      await expect(titles).toHaveText([`${stove} gas`]);
      await expect(field).toHaveValue('');

      // What is already in this list is no longer offered; a tap chooses the other one.
      await field.fill(stove);
      await expect(options).toHaveText([stove]);
      await options.first().click();
      await expect(titles).toHaveText([`${stove} gas`, stove]);

      // Escape closes the suggestions and adds nothing; Enter adds what was typed.
      await field.fill(unique('Zzz'));
      await field.press('Escape');
      await expect(titles).toHaveCount(2);
      await field.press('Enter');
      await expect(titles).toHaveCount(3);
    });
  });
}
