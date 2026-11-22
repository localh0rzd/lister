import { synced, syncStatus, unique } from './support/app';
import { expect, test } from './support/fixtures';

test('a page the user comes back to takes the sync lock from a frozen page', async ({
  page: first,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Page lifecycle needs Chromium CDP');
  await first.goto('/lists');
  await synced(first);
  // The second page opens later, so the first one holds the sync lock and it waits.
  const second = await first.context().newPage();
  await second.goto('/lists');
  await expect(second.getByRole('main')).toBeVisible();

  await test.step('the leading page is frozen in the background (as Android does), still holding the lock', async () => {
    const cdp = await first.context().newCDPSession(first);
    // Headless Chromium can't hide a page, and Page.setWebLifecycleState freezes only hidden
    // pages, so Debugger.pause stands in for the freeze: the lock stays held, no JavaScript runs.
    await cdp.send('Debugger.enable');
    await cdp.send('Debugger.pause');
  });

  const title = unique('Written beside a frozen page');
  await second.getByRole('button', { name: 'New list' }).click();
  const dialog = second.getByRole('dialog', { name: 'New list' });
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(second.getByRole('link', { name: title })).toBeVisible();
  // The frozen page holds the lock, so nothing is sent yet.
  await expect(syncStatus(second)).toContainText('not synced');

  await test.step('the page the user looks at takes the lock and syncs the change', async () => {
    await second.bringToFront();
    // Headless pages report themselves visible all along, so signal the transition itself.
    await second.evaluate(() =>
      document.dispatchEvent(new Event('visibilitychange')),
    );
    await synced(second);
  });
});

test('a page that loads visible while the leader is frozen takes the sync lock', async ({
  page: first,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Page lifecycle needs Chromium CDP');
  await first.goto('/lists');
  await synced(first);

  const cdp = await first.context().newCDPSession(first);
  await cdp.send('Debugger.enable');
  await cdp.send('Debugger.pause');

  // Loaded (or reloaded) while visible: no visibility change follows. The frozen leader can't
  // answer the ping, so the new page takes the lock by itself.
  const second = await first.context().newPage();
  await second.goto('/lists');
  await expect(second.getByRole('main')).toBeVisible();
  await synced(second);
});
