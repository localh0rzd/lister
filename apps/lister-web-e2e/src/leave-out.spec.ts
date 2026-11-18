import { expect, test } from './support/fixtures';
import {
  addItem,
  createList,
  includeList,
  openList,
  section,
  synced,
  unique,
} from './support/app';

test.describe('leaving out', () => {
  test('leave an item out of an included list, run without it, put it back', async ({
    page,
    expectAccessible,
  }) => {
    test.setTimeout(60_000);
    const trip = await createList(page, unique('Trip'));
    const camping = await createList(page, unique('Camping'));
    await openList(page, camping);
    await addItem(page, 'Tent');
    await addItem(page, 'Chair');
    await openList(page, trip);
    await includeList(page, camping);
    const campingSection = section(page, camping);
    await expect(campingSection).toContainText('Chair');

    await test.step('leave Chair out of Trip, with Undo', async () => {
      await campingSection
        .getByRole('button', { name: 'More for Chair' })
        .click();
      await page
        .getByRole('menuitem', { name: `Leave out of ${trip}` })
        .click();
      await expect(page.getByText('“Chair” left out of')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
      await expect(campingSection).not.toContainText('Chair');
      await expect(campingSection).toContainText('1 left out');
      await expectAccessible();
    });

    await test.step('the left-out row lists it, struck through', async () => {
      const toggle = campingSection.locator('.left-out-toggle');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(
        campingSection.getByRole('button', { name: 'Put back Chair' }),
      ).toBeVisible();
      await expectAccessible();
      await page.emulateMedia({ colorScheme: 'dark' });
      await expectAccessible();
      await page.emulateMedia({ colorScheme: 'light' });
    });

    await test.step('a run starts without it', async () => {
      await page.getByRole('button', { name: 'Start run' }).click();
      await expect(
        page.getByRole('button', { name: 'More for this run' }),
      ).toBeVisible();
      await expect(page.getByRole('checkbox', { name: /^Tent/ })).toBeVisible();
      await expect(page.getByRole('checkbox', { name: /^Chair/ })).toHaveCount(
        0,
      );
    });

    await test.step('put it back', async () => {
      await openList(page, trip);
      await section(page, camping).locator('.left-out-toggle').click();
      await section(page, camping)
        .getByRole('button', { name: 'Put back Chair' })
        .click();
      await expect(section(page, camping)).toContainText('Chair');
      await expect(section(page, camping)).not.toContainText('left out');
    });
  });

  test('a duplicated list keeps the left-out item hidden', async ({ page }) => {
    test.setTimeout(60_000);
    const trip = await createList(page, unique('Trip'));
    const camping = await createList(page, unique('Camping'));
    await openList(page, camping);
    await addItem(page, 'Tent');
    await addItem(page, 'Chair');
    await openList(page, trip);
    await includeList(page, camping);
    await section(page, camping)
      .getByRole('button', { name: 'More for Chair' })
      .click();
    await page.getByRole('menuitem', { name: `Leave out of ${trip}` }).click();
    await expect(section(page, camping)).toContainText('1 left out');
    await page.goto('/lists');
    await synced(page);

    await page.getByRole('button', { name: `More for ${trip}` }).click();
    await page.getByRole('menuitem', { name: 'Duplicate' }).click();
    await page.getByRole('button', { name: 'Open' }).click();

    await expect(
      page.getByRole('heading', { level: 1, name: `Copy of ${trip}` }),
    ).toBeVisible();
    await expect(section(page, camping)).toContainText('Tent');
    await expect(section(page, camping)).not.toContainText('Chair');
    await expect(section(page, camping)).toContainText('1 left out');
  });
});
