import { expect, test } from './support/fixtures';

test('reaches the API through the dev proxy', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByText('API status: ok')).toBeVisible();
});

test('reaches the sync socket through the dev proxy', async ({ page }) => {
  await page.goto('/settings');

  // A raw engine.io WebSocket handshake: the server answers with an "open" packet ("0{...}").
  const firstPacket = await page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const url = `${location.origin.replace('http', 'ws')}/socket.io/?EIO=4&transport=websocket`;
        const socket = new WebSocket(url);
        socket.onmessage = (event) => {
          resolve(String(event.data));
          socket.close();
        };
        socket.onerror = () => reject(new Error('WebSocket failed'));
      }),
  );

  expect(firstPacket.startsWith('0{')).toBe(true);
});
