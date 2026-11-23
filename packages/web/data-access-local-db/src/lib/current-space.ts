import { DOCUMENT } from '@angular/common';
import {
  DestroyRef,
  Service,
  type Signal,
  computed,
  inject,
  signal,
} from '@angular/core';
import { LOCAL_DB, type LocalSpace } from './local-db';
import { type QueryState, liveQuerySignal, valueOf } from './live-query-signal';

/** Where the chosen space is remembered on this device. */
export const CURRENT_SPACE_KEY = 'lister.space';

/** Set while signing in as somebody else: how many unsynced changes of the previous user were discarded. */
export const DISCARDED_CHANGES_KEY = 'lister.discarded';

/**
 * The space the UI works in: the one the user picked (remembered on this device), else the first
 * space by name. Spaces arrive with the server's welcome, so on a first, offline start there is
 * none yet, and a remembered space that is gone (left, deleted) falls back to the first.
 */
@Service()
export class CurrentSpace {
  private readonly db = inject(LOCAL_DB);
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly picked = signal<string | undefined>(this.readPicked());

  /** Every space on this device, by name. */
  readonly all: Signal<QueryState<LocalSpace[]>> = liveQuerySignal(
    () => () => this.db.spaces.orderBy('name').toArray(),
  );

  /** `loading` until the local database answered; `ready` with `undefined` before any welcome. */
  readonly state: Signal<QueryState<LocalSpace | undefined>> = computed(() => {
    const spaces = this.all();
    if (spaces.status !== 'ready') return spaces;
    const picked = this.picked();
    return {
      status: 'ready',
      value: spaces.value.find((s) => s.id === picked) ?? spaces.value[0],
    };
  });

  readonly id: Signal<string | undefined> = computed(
    () => valueOf(this.state())?.id,
  );

  constructor() {
    // A space picked in another tab or window of the app applies here too.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== CURRENT_SPACE_KEY && event.key !== null) return;
      this.picked.set(this.readPicked());
    };
    this.window?.addEventListener('storage', onStorage);
    inject(DestroyRef).onDestroy(() =>
      this.window?.removeEventListener('storage', onStorage),
    );
  }

  /**
   * The display name of a member of the space `spaceId` (the space of the row being shown, which
   * need not be the current one), or `undefined` for someone who isn't one (any more). Reads
   * signals, so a template using it updates with the spaces.
   */
  memberName(spaceId: string | undefined, userId: string): string | undefined {
    const spaces = this.all();
    return spaces.status === 'ready'
      ? spaces.value
          .find((s) => s.id === spaceId)
          ?.members.find((m) => m.userId === userId)?.displayName
      : undefined;
  }

  /** Works in `spaceId` from now on, and remembers it. */
  select(spaceId: string): void {
    this.picked.set(spaceId);
    try {
      this.window?.localStorage.setItem(CURRENT_SPACE_KEY, spaceId);
    } catch {
      // Storage is blocked: the choice lasts until the page is reloaded.
    }
  }

  private readPicked(): string | undefined {
    try {
      return this.window?.localStorage.getItem(CURRENT_SPACE_KEY) ?? undefined;
    } catch {
      return undefined;
    }
  }
}
