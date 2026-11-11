import { test, expect } from '@playwright/test';

test('shows the app shell', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('Lister');
});

test('reaches the API through the dev proxy', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('API status: ok')).toBeVisible();
});
