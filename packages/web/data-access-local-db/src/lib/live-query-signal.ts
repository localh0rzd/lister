import {
  DestroyRef,
  ErrorHandler,
  type Signal,
  assertInInjectionContext,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { liveQuery } from 'dexie';

/**
 * A Dexie `liveQuery` as a signal. `source` runs in a reactive context: it reads the signals the
 * query depends on and returns the querier, or `undefined` while there's nothing to query. When
 * those signals change, the query is re-subscribed. The value is `undefined` until the first
 * result arrives, then follows every change to the tables the query read, whether it comes from
 * this tab, another tab or the sync engine.
 *
 * Call it in an injection context (a field initializer of a component or service).
 */
export function liveQuerySignal<T>(
  source: () => (() => T | Promise<T>) | undefined,
): Signal<T | undefined> {
  assertInInjectionContext(liveQuerySignal);
  const errors = inject(ErrorHandler);
  const value = signal<T | undefined>(undefined);

  const watcher = effect((onCleanup) => {
    const querier = source();
    untracked(() => value.set(undefined));
    if (!querier) return;
    const subscription = liveQuery(querier).subscribe({
      next: (result) => value.set(result),
      error: (error: unknown) => errors.handleError(error),
    });
    onCleanup(() => subscription.unsubscribe());
  });
  inject(DestroyRef).onDestroy(() => watcher.destroy());

  return value.asReadonly();
}
