import { expect, test } from './support/fixtures';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

test.describe('install and persistent storage', () => {
  test('"Install app" opens the browser install prompt (Chromium)', async ({
    page,
    expectAccessible,
  }) => {
    await page.goto('/space');
    await expect(page.getByText('Persistent storage')).toBeVisible();
    await expect(page.getByText('Install app')).toBeHidden();

    // The browser fires this when the app is installable; Playwright can't make it do so.
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      (window as unknown as { installPrompted: number }).installPrompted = 0;
      Object.assign(event, {
        prompt: () => {
          (window as unknown as { installPrompted: number }).installPrompted++;
          return Promise.resolve();
        },
      });
      window.dispatchEvent(event);
    });
    await expect(page.getByText('Install app')).toBeVisible();
    await expectAccessible();

    await page.getByRole('button', { name: 'Install', exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { installPrompted: number }).installPrompted,
        ),
      )
      .toBe(1);
    await expect(page.getByText('Install app')).toBeHidden();
  });

  test('asks the browser to keep the data after the first sync and shows the answer', async ({
    page,
  }) => {
    await page.goto('/space');
    // Whether Chromium grants it is up to the browser; the page shows the answer either way.
    await expect(page.getByText(/^(Granted|Not granted)/)).toBeVisible();
  });

  test.describe('iOS Safari', () => {
    test.use({ userAgent: IPHONE, viewport: { width: 390, height: 844 } });

    test('explains Share → Add to Home Screen once, and on the Space page', async ({
      page,
    }) => {
      await page.goto('/lists');
      const hint = page.getByText(
        /Install Lister: Tap Share, then Add to Home Screen/,
      );
      await expect(hint).toBeVisible();
      await page.getByRole('button', { name: 'OK' }).click();
      await expect(hint).toBeHidden();

      // The hint comes with the persistence request: once that has been answered on the next
      // start, the hint had its chance to show again.
      await page.goto('/space');
      await expect(page.getByText(/^(Granted|Not granted)/)).toBeVisible();
      await expect(hint).toBeHidden();
      await expect(
        page.getByText('Tap Share, then Add to Home Screen.'),
      ).toBeVisible();
    });
  });
});
