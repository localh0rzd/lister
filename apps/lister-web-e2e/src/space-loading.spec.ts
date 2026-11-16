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

test('a cold reload of the Space page shows the "Data" heading in one place only', async ({
  page,
}) => {
  await page.goto('/space');
  await expect(
    page.getByRole('list', { name: 'Switch space' }).getByRole('button'),
  ).not.toHaveCount(0);

  // Records the heading's position on every frame from the start of the reload.
  await page.addInitScript(() => {
    const record = window as unknown as { dataY: number[] };
    record.dataY = [];
    const tick = () => {
      const heading = document.getElementById('data-heading');
      if (heading) record.dataY.push(heading.getBoundingClientRect().y);
      if (record.dataY.length < 30) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.reload();
  await expect(page.getByRole('list', { name: 'Members' })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { dataY: number[] }).dataY.length,
      ),
    )
    .toBeGreaterThanOrEqual(30);

  const positions = await page.evaluate(
    () => (window as unknown as { dataY: number[] }).dataY,
  );
  expect(new Set(positions).size).toBe(1);
});
