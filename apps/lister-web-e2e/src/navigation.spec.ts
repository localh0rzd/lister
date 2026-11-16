import { expect, test } from './support/fixtures';

const destinations = ['Lists', 'Runs', 'Space', 'Settings'] as const;

test.describe('navigation on a phone (375 px)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('switches destinations with the bottom navigation bar', async ({
    page,
    expectAccessible,
  }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/lists$/);
    await expect(page.getByRole('banner')).toContainText('Lists');
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
        await expect(page.getByRole('banner')).toContainText(destination);
        await expectAccessible();
      });
    }

    await test.step('keyboard', async () => {
      await nav.getByRole('link', { name: 'Runs' }).focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL('/runs');
    });
  });
});

test.describe('navigation on the narrowest phone (320 px)', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test('fits all four destinations without truncating their names', async ({
    page,
  }) => {
    await page.goto('/settings/profile');
    const nav = page.locator('lister-navigation-bar').getByRole('navigation', {
      name: 'Main',
    });
    await expect(nav.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    const labels = await nav.locator('.label').evaluateAll((els) =>
      els.map((el) => ({
        text: el.textContent?.trim(),
        oneLine: el.getBoundingClientRect().height <= 20,
        inside:
          el.closest('a')!.getBoundingClientRect().right <= window.innerWidth,
      })),
    );
    expect(labels.map((l) => l.text)).toEqual(destinations);
    expect(labels.every((l) => l.oneLine && l.inside)).toBe(true);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  });

  test('the old profile address redirects to Settings', async ({ page }) => {
    await page.goto('/space/profile');
    await expect(page).toHaveURL(/\/settings\/profile$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Profile' }),
    ).toBeVisible();
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

  test('registers no service worker on the dev server', async ({ page }) => {
    await page.goto('/lists');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Lists' }),
    ).toBeVisible();
    await page.waitForLoadState('load');

    const registration = await page.evaluate(async () =>
      Boolean(await navigator.serviceWorker.getRegistration()),
    );
    expect(registration).toBe(false);
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
