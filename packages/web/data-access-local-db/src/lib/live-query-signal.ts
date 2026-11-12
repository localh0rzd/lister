import {
  ErrorHandler,
  type Signal,
  assertInInjectionContext,
  effect,
  inject,
  signal,
} from '@angular/core';
import { liveQuery } from 'dexie';

/** What a live query shows: loading, the latest result, or why it failed. */
export type QueryState<T> =
  | { status: 'loading' }
  | { status: 'ready'; value: T }
  | { status: 'error'; error: unknown };

/** The value when ready, `undefined` otherwise. */
export function valueOf<T>(state: QueryState<T>): T | undefined {
  return state.status === 'ready' ? state.value : undefined;
}

/**
 * A Dexie `liveQuery` as a signal. `source` runs in a reactive context: it reads the signals the
 * query depends on and returns the querier, or `undefined` while there's nothing to query (the
 * state stays `loading`). When those signals change, the query is re-subscribed, and a slow
 * result for the old source is dropped. The state follows every change to the tables the query
 * read, whether it comes from this tab, another tab or the sync engine. A failure (e.g. IndexedDB
 * unavailable) becomes `error` and goes to the ErrorHandler; Dexie ends a failed live query, so
 * it stays `error` until `source` changes.
 *
 * Call it in an injection context (a field initializer); it stops when that context is destroyed.
 */
export function liveQuerySignal<T>(
  source: () => (() => T | Promise<T>) | undefined,
): Signal<QueryState<T>> {
  assertInInjectionContext(liveQuerySignal);
  const errors = inject(ErrorHandler);
  const state = signal<QueryState<T>>({ status: 'loading' });

  effect((onCleanup) => {
    const querier = source();
    state.set({ status: 'loading' });
    if (!querier) return;
    const subscription = liveQuery(querier).subscribe({
      next: (value) => state.set({ status: 'ready', value }),
      error: (error: unknown) => {
        state.set({ status: 'error', error });
        errors.handleError(error);
      },
    });
    onCleanup(() => subscription.unsubscribe());
  });

  return state.asReadonly();
}
