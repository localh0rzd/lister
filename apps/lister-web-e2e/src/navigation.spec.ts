import { expect, test } from './support/fixtures';

const destinations = ['Lists', 'Runs', 'Space'] as const;

test.describe('navigation on a phone (375 px)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('switches destinations with the bottom navigation bar', async ({
    page,
    expectAccessible,
  }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/lists$/);
    await expect(page.getByRole('banner')).toContainText('Lister');
    const nav = page.locator('lister-navigation-bar').getByRole('navigation', {
      name: 'Main',
    });
    await expect(nav).toBeVisible();
    await expect(page.locator('lister-navigation-rail')).toHaveCount(0);

    for (const destination of destinations) {
      await test.step(destination, async () => {
        await nav.getByRole('link', { name: destination }).click();
        await expect(page).toHaveURL(`/${destination.toLowerCase()}`);
        await expect(
          page.getByRole('heading', { level: 1, name: destination }),
        ).toBeVisible();
        await expect(
          nav.getByRole('link', { name: destination }),
        ).toHaveAttribute('aria-current', 'page');
        await expect(page).toHaveTitle(`${destination} · Lister`);
        await expectAccessible();
      });
    }
  });
});

test.describe('navigation on a desktop (1280 px)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('switches destinations with the navigation rail', async ({
    page,
    expectAccessible,
  }) => {
    await page.goto('/');
    const nav = page.locator('lister-navigation-rail').getByRole('navigation', {
      name: 'Main',
    });
    await expect(nav).toBeVisible();
    await expect(page.locator('lister-navigation-bar')).toHaveCount(0);
    await expect(page.getByRole('banner')).toHaveCount(0);

    for (const destination of [...destinations].reverse()) {
      await test.step(destination, async () => {
        await nav.getByRole('link', { name: destination }).click();
        await expect(
          page.getByRole('heading', { level: 1, name: destination }),
        ).toBeVisible();
        await expect(
          nav.getByRole('link', { name: destination }),
        ).toHaveAttribute('aria-current', 'page');
        await expectAccessible();
      });
    }
  });

  test('can be used with the keyboard', async ({ page }) => {
    await page.goto('/lists');
    const runs = page
      .locator('lister-navigation-rail')
      .getByRole('link', { name: 'Runs' });

    await runs.focus();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL('/runs');
    await expect(runs).toHaveAttribute('aria-current', 'page');
  });

  test('switches to the phone layout when the window gets narrow', async ({
    page,
  }) => {
    await page.goto('/runs');
    await expect(page.locator('lister-navigation-rail')).toBeVisible();

    await page.setViewportSize({ width: 375, height: 812 });

    await expect(page.locator('lister-navigation-bar')).toBeVisible();
    await expect(page.locator('lister-navigation-rail')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Runs' }),
    ).toBeVisible();
  });
});
