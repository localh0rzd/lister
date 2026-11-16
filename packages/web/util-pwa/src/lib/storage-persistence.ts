import { Service, signal } from '@angular/core';

/** Whether the browser keeps Lister's local data: `unsupported` = no Storage API. */
export type PersistenceState = 'unknown' | 'granted' | 'denied' | 'unsupported';

/**
 * Asks the browser not to evict the local database (`navigator.storage.persist()`). The server
 * stays the source of truth; only unsynced changes are at risk. The Space page shows the state.
 *
 * Chromium decides from how much the site is used, so a refusal isn't final: `request()` is
 * called again at the next start until it's granted.
 */
@Service()
export class StoragePersistence {
  readonly state = signal<PersistenceState>('unknown');

  constructor() {
    const storage =
      typeof navigator === 'undefined' ? undefined : navigator.storage;
    if (!storage?.persist || !storage.persisted) {
      this.state.set('unsupported');
      return;
    }
    storage
      .persisted()
      .then((persisted) => {
        if (persisted) this.state.set('granted');
      })
      .catch(() => undefined);
  }

  /** Requests persistence unless it's already granted. */
  async request(): Promise<void> {
    if (this.state() === 'unsupported' || this.state() === 'granted') return;
    try {
      this.state.set(
        (await navigator.storage.persist()) ? 'granted' : 'denied',
      );
    } catch {
      this.state.set('denied');
    }
  }
}
