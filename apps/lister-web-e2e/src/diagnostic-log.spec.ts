import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import {
  addItem,
  createList,
  openList,
  syncStatus,
  synced,
} from './support/app';

/** Downloads the log from Settings → App and returns its text. */
async function exportLog(page: Page): Promise<string> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export diagnostic log' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(
    /^lister-diagnostic-\d{4}-\d{2}-\d{2}\.log$/,
  );
  return readFile(await file.path(), 'utf8');
}

for (const [name, viewport] of [
  ['phone', { width: 375, height: 812 }],
  ['desktop', { width: 1280, height: 800 }],
] as const) {
  test.describe(`diagnostic log (${name})`, () => {
    test.use({ viewport });

    test('exports connect, disconnect and reconnect entries, then clears them', async ({
      page,
      context,
      expectAccessible,
    }) => {
      const title = await createList(page);
      await openList(page, title);
      await addItem(page, 'Secret tent');
      await synced(page);

      await test.step('the connection drops and comes back', async () => {
        await context.setOffline(true);
        await expect(syncStatus(page)).toContainText('Offline');
        await context.setOffline(false);
        await synced(page);
      });

      const starts = (log: string) => (log.match(/ app\.start /g) ?? []).length;
      let startsBefore = 0;

      await test.step('exports from Settings', async () => {
        await page
          .getByRole('navigation', { name: 'Main' })
          .getByRole('link', { name: 'Settings' })
          .click();
        await expect(
          page.getByRole('button', { name: 'Clear diagnostic log' }),
        ).toBeVisible();
        await expectAccessible();

        const log = await exportLog(page);
        await expect(
          page
            .getByRole('status')
            .filter({ hasText: 'Diagnostic log downloaded' }),
        ).toBeVisible();

        startsBefore = starts(log);

        // The header names the device, app and service worker.
        expect(log).toMatch(/^# Lister diagnostic log$/m);
        for (const key of [
          'userAgent',
          'platform',
          'mode',
          'onLine',
          'serviceWorker',
          'storagePersisted',
          'build',
        ])
          expect(log).toContain(`# ${key}: `);
        expect(log).toMatch(/^# sync: \{/m);

        const lines = log.split('\n').filter((line) => /^\d{4}-/.test(line));
        const at = (event: string) =>
          lines.findIndex((line) => line.includes(` ${event}`));
        const lastAt = (event: string) =>
          lines.reduce(
            (last, line, i) => (line.includes(` ${event}`) ? i : last),
            -1,
          );
        const connect = at('socket.connect ');
        const disconnect = at('socket.disconnect ');
        expect(connect).toBeGreaterThan(-1);
        expect(disconnect).toBeGreaterThan(connect);
        // Connected again after the drop.
        expect(lastAt('socket.connect ')).toBeGreaterThan(disconnect);
        expect(lines[disconnect]).toMatch(/"reason":"/);
        expect(lines[connect]).toMatch(/"sid":"[^"]+"/);
        expect(at('net.offline')).toBeGreaterThan(-1);
        expect(lastAt('net.online')).toBeGreaterThan(at('net.offline'));
        expect(log).toMatch(
          /sync\.status .*"reason":"disconnect: [^"]+","online":false/,
        );
        expect(log).toMatch(
          /sync\.status .*"reason":"welcome[^"]*","online":true/,
        );
        expect(log).toMatch(/sync\.welcome /);
        expect(log).toMatch(
          /rest\.end .*"path":"\/api\/auth\/me".*"status":200/,
        );
        expect(log).toMatch(/lock\.acquired /);

        // Nothing the user typed.
        expect(log).not.toContain('Secret tent');
        expect(log).not.toContain(title);
      });

      await test.step('the log survives a reload', async () => {
        await page.reload();
        const log = await exportLog(page);
        expect(starts(log)).toBe(startsBefore + 1);
        expect(log).toContain(' socket.disconnect ');
      });

      await test.step('Undo puts a cleared log back', async () => {
        await page
          .getByRole('button', { name: 'Clear diagnostic log' })
          .click();
        await page.getByRole('button', { name: 'Undo' }).click();
        await expect(
          page
            .getByRole('status')
            .filter({ hasText: 'Diagnostic log restored' }),
        ).toBeVisible();
        expect(await exportLog(page)).toContain(' socket.disconnect ');
      });

      await test.step('clearing empties it', async () => {
        await page
          .getByRole('button', { name: 'Clear diagnostic log' })
          .click();
        await expect(
          page
            .getByRole('status')
            .filter({ hasText: 'Diagnostic log cleared' }),
        ).toBeVisible();
        const log = await exportLog(page);
        expect(log).not.toContain('socket.disconnect');
        expect(log).not.toMatch(/net\.offline/);
      });
    });
  });
}
