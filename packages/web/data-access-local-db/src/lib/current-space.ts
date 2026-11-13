import { Service, type Signal, computed, inject } from '@angular/core';
import { LOCAL_DB, type LocalSpace } from './local-db';
import { type QueryState, liveQuerySignal, valueOf } from './live-query-signal';

/**
 * The space the UI works in. Until spaces can be picked (T-026) that is the first space by name.
 * Spaces arrive with the server's welcome, so on a first, offline
 * start there is none yet.
 */
@Service()
export class CurrentSpace {
  private readonly db = inject(LOCAL_DB);
  private readonly spaces: Signal<QueryState<LocalSpace[]>> = liveQuerySignal(
    () => () => this.db.spaces.orderBy('name').toArray(),
  );

  /** `loading` until the local database answered; `ready` with `undefined` before any welcome. */
  readonly state: Signal<QueryState<LocalSpace | undefined>> = computed(() => {
    const spaces = this.spaces();
    return spaces.status === 'ready'
      ? { status: 'ready', value: spaces.value[0] }
      : spaces;
  });

  readonly id: Signal<string | undefined> = computed(
    () => valueOf(this.state())?.id,
  );
}
