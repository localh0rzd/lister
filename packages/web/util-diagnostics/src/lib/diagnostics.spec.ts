import { TestBed } from '@angular/core/testing';
import { DIAGNOSTIC_STORE, Diagnostics, FLUSH_DELAY_MS } from './diagnostics';
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
  store.close();
});

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
});
