import { expect, test } from './support/fixtures';

test('the Space page shows a spinner while the members load, and nothing moves when they arrive', async ({
  page,
}) => {
  // Visit once so the device knows its spaces (they come with the sync welcome).
  await page.goto('/space');
  const switcher = page.getByRole('list', { name: 'Switch space' });
  await expect(switcher.getByRole('button').first()).toBeVisible();

  // Come back to it with the members request slowed down.
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/spaces', async (route) => {
    await gate;
    await route.continue();
  });
  await page.reload();

  const dataHeading = page.getByRole('heading', { name: 'Data' });
  const members = page.getByRole('list', { name: 'Members' });
  await expect(
    page.getByRole('heading', { name: /^Members of / }),
  ).toBeVisible();
  await expect(
    page.getByRole('progressbar', { name: 'Loading members' }),
  ).toBeVisible();
  await expect(members).toHaveCount(0);
  await expect(switcher.getByRole('button').first()).toBeVisible();
  const before = await dataHeading.boundingBox();

  release();
  await expect(members).toBeVisible();
  await expect(
    page.getByRole('progressbar', { name: 'Loading members' }),
  ).toHaveCount(0);
  const after = await dataHeading.boundingBox();
  expect(before).not.toBeNull();
  expect(after?.y).toBe(before?.y);
});
