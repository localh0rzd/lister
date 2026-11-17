import { expect, test } from './support/fixtures';
import { addItem, createList, openList, unique } from './support/app';

for (const [device, viewport] of [
  ['phone', { width: 320, height: 568 }],
  ['desktop', { width: 1280, height: 800 }],
] as const) {
  test.describe(`search on a ${device}`, () => {
    test.use({ viewport });

    test('finds an item, names its list and opens it; finds a list; Escape clears', async ({
      page,
      expectAccessible,
    }) => {
      const stove = unique('Kocher');
      const camping = await createList(page, unique('Camping'));
      await openList(page, camping);
      await addItem(page, stove);
      await page.goto('/lists');

      // "/" focuses the field; accents and case are ignored.
      const field = page.getByRole('combobox', { name: 'Search' });
      await expect(field).toBeVisible();
      await page.keyboard.press('/');
      await expect(field).toBeFocused();
      await field.fill(stove.toUpperCase().replace('KOCHER', 'kôcher'));
      const option = page.getByRole('option', {
        name: `${stove} in ${camping}`,
      });
      await expect(option).toBeVisible();
      await expect(page.getByRole('group', { name: 'Items' })).toBeVisible();
      // Nothing sticks out of the screen, even at 320 px.
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await expectAccessible();
      // Nothing of the field (no floating label either) sticks out of its app bar. (The results
      // panel is a popover placed inside the field, so it is left out.)
      const bar = await page
        .locator('lister-search-field')
        .evaluate((host) => host.closest('.top-bar')?.getBoundingClientRect());
      const parts = await page
        .locator('lister-search-field mat-form-field *')
        .evaluateAll((elements) =>
          elements
            .filter((e) => !e.closest('.cdk-overlay-popover'))
            .map((e) => e.getBoundingClientRect())
            .filter((r) => r.height > 0),
        );
      for (const part of parts) {
        expect(part.top).toBeGreaterThanOrEqual(bar?.top ?? NaN);
        expect(part.bottom).toBeLessThanOrEqual(bar?.bottom ?? NaN);
      }

      // Arrow and Enter open the list the item is in.
      await field.press('ArrowDown');
      await field.press('Enter');
      await expect(
        page.getByRole('heading', { level: 1, name: camping }),
      ).toBeVisible();
      await expect(field).toHaveValue('');

      // A list is found by its title, by tapping the result; Escape clears the field.
      await page.goto('/lists');
      await field.fill(camping.slice(0, -3));
      await page
        .getByRole('group', { name: 'Lists' })
        .getByRole('option', { name: camping })
        .click();
      await expect(
        page.getByRole('heading', { level: 1, name: camping }),
      ).toBeVisible();
      await field.fill('nothing like this zzz');
      await expect(
        page.getByRole('option', { name: 'No matches' }),
      ).toBeVisible();
      await field.press('Escape');
      await expect(field).toHaveValue('');
    });

    test('finds an active run', async ({ page }) => {
      const list = await createList(page, unique('Weekend'));
      await openList(page, list);
      await addItem(page, unique('Item'));
      await page.getByRole('button', { name: 'Start run' }).click();
      await page.waitForURL(/\/runs\/.+/);
      await page.goto('/runs');
      const field = page.getByRole('combobox', { name: 'Search' });
      await field.fill(list);
      await page
        .getByRole('group', { name: 'Runs' })
        .getByRole('option', { name: list })
        .click();
      await expect(page).toHaveURL(/\/runs\/.+/);
    });
  });
}

test('the page does not jump when the search field arrives', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/space');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await page.evaluate(() => {
    const w = window as unknown as { tops: number[] };
    w.tops = [];
    const tick = () => {
      const main = document.querySelector('main');
      if (main) w.tops.push(Math.round(main.getBoundingClientRect().top));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.getByRole('link', { name: 'Lists' }).first().click();
  await expect(page.getByRole('combobox', { name: 'Search' })).toBeVisible();
  const tops = await page.evaluate(
    () => (window as unknown as { tops: number[] }).tops,
  );
  // Space has no search bar, Lists has: one move, no step in between.
  expect(tops.filter((top, i) => i === 0 || top !== tops[i - 1])).toHaveLength(
    2,
  );
});
