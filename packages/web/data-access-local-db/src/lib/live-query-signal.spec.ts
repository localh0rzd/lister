import { ErrorHandler, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { newId } from '@lister/shared/domain';
import { liveQuerySignal, valueOf } from './live-query-signal';
import { LocalDb } from './local-db';

let db: LocalDb;
const handleError = vi.fn();

beforeEach(() => {
  db = new LocalDb(`test-${newId()}`);
  handleError.mockClear();
  TestBed.configureTestingModule({
    providers: [{ provide: ErrorHandler, useValue: { handleError } }],
  });
});
afterEach(async () => {
  TestBed.resetTestingModule();
  await db.delete();
});

describe('liveQuerySignal', () => {
  it('reports a failed query as an error, not as loading forever', async () => {
    const failure = new Error('IndexedDB is unavailable');
    const state = TestBed.runInInjectionContext(() =>
      liveQuerySignal(() => () => Promise.reject(failure)),
    );

    await vi.waitFor(() => {
      TestBed.tick();
      expect(state()).toEqual({ status: 'error', error: failure });
    });
    expect(handleError).toHaveBeenCalledWith(failure);
  });

  it('drops a slow result for a source that has since changed', async () => {
    const which = signal<'slow' | 'fast'>('slow');
    let releaseSlow!: () => void;
    const slowDone = new Promise<void>((resolve) => (releaseSlow = resolve));
    const state = TestBed.runInInjectionContext(() =>
      liveQuerySignal(() => {
        const current = which();
        return async () => {
          await db.meta.count(); // makes the query observe a table
          if (current === 'slow') await slowDone;
          return current;
        };
      }),
    );
    TestBed.tick();

    which.set('fast');
    await vi.waitFor(() => {
      TestBed.tick();
      expect(valueOf(state())).toBe('fast');
    });
    releaseSlow();
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
    await db.meta.count();

    expect(valueOf(state())).toBe('fast');
  });

  it('stays loading while the source has nothing to query', () => {
    const state = TestBed.runInInjectionContext(() =>
      liveQuerySignal(() => undefined),
    );
    TestBed.tick();

    expect(state()).toEqual({ status: 'loading' });
  });
});
