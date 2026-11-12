import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type TestApp, createTestApp } from '../testing/create-test-app';

const INDEX = '<!doctype html><title>Lister</title>';

describe('serving the web app (one origin)', () => {
  let webRoot: string;
  let api: TestApp;

  beforeEach(async () => {
    webRoot = mkdtempSync(join(tmpdir(), 'lister-web-'));
    writeFileSync(join(webRoot, 'index.html'), INDEX);
    writeFileSync(join(webRoot, 'main-ABCD1234.js'), 'console.log(1)');
    writeFileSync(join(webRoot, 'chunk-AB-cd_12.js'), 'console.log(2)');
    writeFileSync(join(webRoot, 'ngsw.json'), '{}');
    mkdirSync(join(webRoot, 'icons'));
    writeFileSync(join(webRoot, 'icons', 'icon-192.png'), 'png');
    api = await createTestApp({ webRoot });
  });
  afterEach(async () => {
    await api.close();
    rmSync(webRoot, { recursive: true, force: true });
  });

  const get = (path: string, accept = 'text/html') =>
    fetch(`${api.url}${path}`, { headers: { accept } });

  it.each([
    '/',
    '/lists',
    '/lists/0190a000-0000-7000-8000-000000000001',
    '/space',
  ])('answers the page %s with index.html, never cached', async (path) => {
    const response = await get(path);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(INDEX);
    expect(response.headers.get('cache-control')).toBe('no-cache');
  });

  it('serves hashed build files for a year, and the service worker files fresh', async () => {
    for (const name of ['/main-ABCD1234.js', '/chunk-AB-cd_12.js']) {
      expect((await get(name, '*/*')).headers.get('cache-control'), name).toBe(
        'public, max-age=31536000, immutable',
      );
    }
    const script = await get('/main-ABCD1234.js', '*/*');
    expect(script.status).toBe(200);
    expect(script.headers.get('content-type')).toContain('javascript');
    expect(script.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable',
    );

    const manifest = await get('/ngsw.json', 'application/json');
    expect(manifest.headers.get('cache-control')).toBe('no-cache');

    expect((await get('/icons/icon-192.png', 'image/png')).status).toBe(200);
  });

  it('never answers the API or the socket with the page', async () => {
    const health = await get('/api/health');
    expect(health.headers.get('content-type')).toContain('application/json');

    for (const path of [
      '/api',
      '/api/nope',
      '/socket.io/?EIO=4&transport=polling',
    ]) {
      const response = await get(path);
      expect(await response.text(), path).not.toBe(INDEX);
      expect(response.status, path).toBeGreaterThanOrEqual(400);
    }
  });

  it.each([
    ['/chunk-MISSING1.js', '*/*'],
    [
      '/icons/missing.png',
      'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    ],
    ['/data.json', '*/*'],
    ['/.hidden', 'text/html'],
  ])(
    'answers a missing file %s with 404, not the page (as browsers ask)',
    async (path, accept) => {
      const response = await get(path, accept);

      expect(response.status).toBe(404);
      expect(await response.text()).not.toBe(INDEX);
    },
  );

  it('answers pages whatever the browser accepts', async () => {
    const response = await get('/lists', '*/*');

    expect(await response.text()).toBe(INDEX);
  });

  it('never answers the API with the page, whatever the case', async () => {
    const response = await get('/API/nope');

    expect(await response.text()).not.toBe(INDEX);
  });
});

describe('without a web build (development)', () => {
  it('serves no pages', async () => {
    const api = await createTestApp();
    onTestFinished(() => api.close());

    expect(
      (await fetch(`${api.url}/`, { headers: { accept: 'text/html' } })).status,
    ).toBe(404);
  });
});
