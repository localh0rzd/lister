import { TestBed } from '@angular/core/testing';
import { PERSIST_REFUSED_KEY, StoragePersistence } from './storage-persistence';

function stubStorage(storage: Partial<StorageManager> | undefined) {
  vi.stubGlobal('navigator', { ...navigator, storage });
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve));
}

describe('StoragePersistence', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('is unsupported without the Storage API', () => {
    stubStorage(undefined);
    expect(TestBed.inject(StoragePersistence).state()).toBe('unsupported');
  });

  it('starts out granted when the browser already keeps the data', async () => {
    stubStorage({ persist: vi.fn(), persisted: () => Promise.resolve(true) });
    const persistence = TestBed.inject(StoragePersistence);
    await settle();
    expect(persistence.state()).toBe('granted');
  });

  it('requests persistence and reports the answer', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    stubStorage({ persist, persisted: () => Promise.resolve(false) });
    const persistence = TestBed.inject(StoragePersistence);
    expect(persistence.state()).toBe('unknown');

    await persistence.request();

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persistence.state()).toBe('granted');
  });

  it('reports a refusal and a failure as denied', async () => {
    stubStorage({
      persist: () => Promise.resolve(false),
      persisted: () => Promise.resolve(false),
    });
    const persistence = TestBed.inject(StoragePersistence);
    await persistence.request();
    expect(persistence.state()).toBe('denied');

    stubStorage({
      persist: () => Promise.reject(new Error('blocked')),
      persisted: () => Promise.resolve(false),
    });
    TestBed.resetTestingModule();
    const failing = TestBed.inject(StoragePersistence);
    await failing.request();
    expect(failing.state()).toBe('denied');
  });

  it('does not ask again once granted', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    stubStorage({ persist, persisted: () => Promise.resolve(false) });
    const persistence = TestBed.inject(StoragePersistence);
    await persistence.request();
    await persistence.request();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('starts out denied after a refusal on an earlier start, and forgets it once granted', async () => {
    stubStorage({
      persist: () => Promise.resolve(false),
      persisted: () => Promise.resolve(false),
    });
    await TestBed.inject(StoragePersistence).request();
    expect(localStorage.getItem(PERSIST_REFUSED_KEY)).not.toBeNull();

    // The next start: no "not requested yet" before asking again.
    TestBed.resetTestingModule();
    const persist = vi.fn(() => Promise.resolve(true));
    stubStorage({ persist, persisted: () => Promise.resolve(false) });
    const next = TestBed.inject(StoragePersistence);
    expect(next.state()).toBe('denied');

    await next.request();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(next.state()).toBe('granted');
    expect(localStorage.getItem(PERSIST_REFUSED_KEY)).toBeNull();
  });
});
