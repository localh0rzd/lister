import { expect, test } from './support/fixtures';
import { addItem, createList, openList, unique } from './support/app';

for (const [device, viewport] of [
  ['phone', { width: 375, height: 812 }],
  ['desktop', { width: 1280, height: 800 }],
] as const) {
  test.describe(`all items on a ${device}`, () => {
    test.use({ viewport });

    test('shows a shared item once with both lists; a list link opens that list', async ({
      page,
      expectAccessible,
    }) => {
      const shared = unique('Sunscreen');
      const camping = await createList(page, unique('Camping'));
      const beach = await createList(page, unique('Beach'));
      for (const list of [camping, beach]) {
        await openList(page, list);
        await addItem(page, list === beach ? shared.toUpperCase() : shared);
      }

      await page.goto('/lists');
      await page.getByRole('link', { name: 'All items' }).click();
      await expect(
        page.getByRole('heading', { level: 1, name: 'All items' }),
      ).toBeVisible();

      const row = page
        .getByRole('list', { name: 'All items' })
        .getByRole('listitem')
        .filter({ hasText: shared });
      await expect(row).toHaveCount(1);
      await expect(row.getByRole('link')).toHaveText([beach, camping].sort());
      await expectAccessible();

      await row.getByRole('link', { name: camping }).click();
      await expect(
        page.getByRole('heading', { level: 1, name: camping }),
      ).toBeVisible();
    });
  });
}
