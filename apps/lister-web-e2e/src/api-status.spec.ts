import { expect, test } from './support/fixtures';

test('reaches the API through the dev proxy', async ({ page }) => {
  await page.goto('/space');
  await expect(page.getByText('API status: ok')).toBeVisible();
});
