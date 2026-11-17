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
      const heading = page.getByRole('heading', {
        level: 1,
        name: 'All items',
      });
      await expect(heading).toBeVisible();
      // Really on screen: the top-level pages' heading is only 1 px on phones.
      expect((await heading.boundingBox())?.height).toBeGreaterThan(20);

      const row = page
        .getByRole('list', { name: 'All items' })
        .getByRole('listitem')
        .filter({ hasText: shared });
      await expect(row).toHaveCount(1);
      await expect(row.getByRole('link')).toHaveText([beach, camping].sort());
      await expectAccessible();

      // Each list link is a 48 px touch target, though it looks 32 px high.
      const link = row.getByRole('link', { name: camping });
      await link.scrollIntoViewIfNeeded();
      const box = await link.boundingBox();
      if (!box) throw new Error('no list link');
      for (const y of [box.y - 7, box.y + box.height + 7]) {
        expect(
          await page.evaluate(
            ([x, y]) =>
              document.elementFromPoint(x, y)?.closest('a')?.textContent,
            [box.x + box.width / 2, y],
          ),
        ).toContain(camping);
      }

      await link.click();
      await expect(
        page.getByRole('heading', { level: 1, name: camping }),
      ).toBeVisible();
    });
  });
}
