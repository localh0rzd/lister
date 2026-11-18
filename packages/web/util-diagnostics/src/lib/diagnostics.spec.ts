import { TestBed } from '@angular/core/testing';
import {
  DIAGNOSTIC_STORE,
  Diagnostics,
  FLUSH_DELAY_MS,
  REPEAT_EVERY,
} from './diagnostics';
import { DiagnosticStore } from './diagnostic-store';

let store: DiagnosticStore;
let diagnostics: Diagnostics;

beforeEach(async () => {
  store = new DiagnosticStore();
  await store.clear();
  TestBed.configureTestingModule({
    providers: [
      { provide: DIAGNOSTIC_STORE, useValue: () => Promise.resolve(store) },
    ],
  });
  diagnostics = TestBed.inject(Diagnostics);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  store.close();
  Reflect.deleteProperty(window, 'fetch');
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

/** Answers `fetch` like the server (or the service worker) would. */
function fakeFetch(answer: () => Promise<Response>) {
  const fetch = vi.fn(answer);
  Object.defineProperty(window, 'fetch', { configurable: true, value: fetch });
  return fetch;
}

const events = async () =>
  (await diagnostics.entries()).map((entry) => [entry.event, entry.data]);

describe('Diagnostics', () => {
  it('stores entries after a short delay, in one batch', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    diagnostics.log('net', 'offline', { onLine: false });
    diagnostics.log('net', 'online', { onLine: true });
    expect(await store.count()).toBe(0);
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS);
    await diagnostics.flush();
    expect((await store.all()).map((e) => e.event)).toEqual([
      'offline',
      'online',
    ]);
  });

  it('records the tab and whether it leads', async () => {
    diagnostics.log('sync', 'a');
    diagnostics.leader = true;
    diagnostics.log('sync', 'b');
    const [a, b] = await diagnostics.entries();
    expect(a).toMatchObject({ tab: diagnostics.tabId, leader: false });
    expect(b).toMatchObject({ leader: true });
  });

  it('keeps no quoted text', async () => {
    diagnostics.log('sync', 'reject', {
      reason: '“Secret milk” is already included',
    });
    const [entry] = await diagnostics.entries();
    expect(JSON.stringify(entry)).not.toContain('Secret');
  });

  it('survives a store that fails: entries stay available in memory', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DIAGNOSTIC_STORE,
          useValue: () => Promise.reject(new Error('no idb')),
        },
      ],
    });
    const broken = TestBed.inject(Diagnostics);
    broken.log('app', 'start');
    await broken.flush();
    expect((await broken.entries()).map((e) => e.event)).toEqual(['start']);
  });

  it('clears stored and waiting entries', async () => {
    diagnostics.log('app', 'one');
    await diagnostics.flush();
    diagnostics.log('app', 'two');
    await diagnostics.clear();
    expect(await diagnostics.entries()).toEqual([]);
  });

  it('describes registered states in the header and survives one that throws', async () => {
    diagnostics.registerState('sync', () => ({ online: false }));
    diagnostics.registerState('broken', () => {
      throw new Error('x');
    });
    diagnostics.serverTimeOffsetMs = 1200;
    const header = await diagnostics.header();
    expect(header['sync']).toBe('{"online":false}');
    expect(header['broken']).toBe('unavailable');
    expect(header['serverTimeOffsetMs']).toBe('1200');
    expect(header).toHaveProperty('userAgent');
    expect(header).toHaveProperty('onLine');
    expect(header).toHaveProperty('mode');
    expect(header).toHaveProperty('serviceWorker');
    expect(header).toHaveProperty('storagePersisted');
    expect(header['angular']).toMatch(/^\d+\./);
  });

  it('unregisters a state', async () => {
    const off = diagnostics.registerState('x', () => 1);
    off();
    expect(await diagnostics.header()).not.toHaveProperty('x');
  });

  describe('a failure that repeats', () => {
    beforeEach(() => vi.spyOn(diagnostics, 'probe').mockResolvedValue());

    it('is logged a few times, then every REPEAT_EVERY-th time, with the count', async () => {
      for (let i = 0; i < REPEAT_EVERY * 2; i++)
        diagnostics.logRepeating('socket', 'connect_error', { message: 'x' });
      expect(
        (await diagnostics.entries()).map((entry) => entry.data?.['repeat']),
      ).toEqual([undefined, 2, 3, REPEAT_EVERY, REPEAT_EVERY * 2]);
      expect(diagnostics.probe).toHaveBeenCalledTimes(3);
    });

    it('is logged in full again once it changes or ends', async () => {
      diagnostics.logRepeating('socket', 'connect_error', { message: 'x' });
      diagnostics.logRepeating('socket', 'connect_error', { message: 'y' });
      diagnostics.endRepeating();
      diagnostics.logRepeating('socket', 'connect_error', { message: 'y' });
      expect(await events()).toEqual([
        ['connect_error', { message: 'x' }],
        ['connect_error', { message: 'y' }],
        ['connect_error', { message: 'y' }],
      ]);
    });
  });

  describe('probe', () => {
    it('logs the HTTP status the API answers with, and the page origin', async () => {
      const fetch = fakeFetch(() =>
        Promise.resolve(new Response(null, { status: 502 })),
      );
      await diagnostics.probe('connect_error');
      expect(fetch).toHaveBeenCalledWith(
        '/api/auth/me',
        expect.objectContaining({ cache: 'no-store' }),
      );
      expect(await events()).toEqual([
        [
          'probe',
          expect.objectContaining({
            why: 'connect_error',
            path: '/api/auth/me',
            status: 502,
            origin: location.origin,
          }),
        ],
      ]);
    });

    it('logs status 0 with the error when no answer comes', async () => {
      fakeFetch(() => Promise.reject(new TypeError('Failed to fetch')));
      await diagnostics.probe('connect_error');
      expect(await events()).toEqual([
        [
          'probe',
          expect.objectContaining({
            status: 0,
            name: 'TypeError',
            message: 'Failed to fetch',
          }),
        ],
      ]);
    });

    it('runs one at a time', async () => {
      let answer: (response: Response) => void = () => undefined;
      const fetch = fakeFetch(
        () => new Promise<Response>((resolve) => (answer = resolve)),
      );
      const first = diagnostics.probe('a');
      await diagnostics.probe('b');
      answer(new Response(null, { status: 200 }));
      await first;
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  it('gives back what it cleared, and puts it back (Undo)', async () => {
    diagnostics.log('app', 'one');
    await diagnostics.flush();
    diagnostics.log('app', 'two');
    const removed = await diagnostics.clear();
    expect(removed.map((entry) => entry.event)).toEqual(['one', 'two']);
    expect(await diagnostics.entries()).toEqual([]);
    diagnostics.log('app', 'three');
    await diagnostics.restore(removed);
    expect((await diagnostics.entries()).map((entry) => entry.event)).toEqual([
      'one',
      'two',
      'three',
    ]);
  });

  describe("the service worker's own report in the header", () => {
    it('is the text of /ngsw/state when a worker controls the page', async () => {
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: {
          controller: { state: 'activated', scriptURL: '/ngsw-worker.js' },
          getRegistration: () => Promise.resolve(undefined),
        },
      });
      const fetch = fakeFetch(() =>
        Promise.resolve(
          new Response('NGSW Debug Info:\n\nDriver state: SAFE_MODE\n'),
        ),
      );
      const header = await diagnostics.header();
      expect(fetch).toHaveBeenCalledWith('/ngsw/state', expect.anything());
      expect(header['serviceWorkerState']).toBe(
        'NGSW Debug Info:\n\nDriver state: SAFE_MODE',
      );
    });

    it('is not asked for without a controlling worker', async () => {
      const fetch = fakeFetch(() => Promise.resolve(new Response('')));
      const header = await diagnostics.header();
      expect(fetch).not.toHaveBeenCalled();
      expect(header['serviceWorkerState']).toBe('no controlling worker');
    });
  });
});
