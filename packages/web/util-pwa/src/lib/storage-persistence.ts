import { Service, signal } from '@angular/core';

/** Whether the browser keeps Lister's local data: `unsupported` = no Storage API. */
export type PersistenceState = 'unknown' | 'granted' | 'denied' | 'unsupported';

/** localStorage flag: the browser refused the last persistence request on this device. */
export const PERSIST_REFUSED_KEY = 'lister.storagePersistRefused';

/**
 * Asks the browser not to evict the local database (`navigator.storage.persist()`). The server
 * stays the source of truth; only unsynced changes are at risk. The Space page shows the state.
 *
 * Chromium decides from how much the site is used, so a refusal isn't final: `request()` is
 * called again at the next start until it's granted. Until then the last refusal is remembered,
 * so the state doesn't claim "not requested yet" at every start.
 */
@Service()
export class StoragePersistence {
  readonly state = signal<PersistenceState>(
    refusedBefore() ? 'denied' : 'unknown',
  );

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
    let granted = false;
    try {
      granted = await navigator.storage.persist();
    } catch {
      // Treated as a refusal.
    }
    this.state.set(granted ? 'granted' : 'denied');
    rememberRefusal(!granted);
  }
}

function refusedBefore(): boolean {
  try {
    return localStorage.getItem(PERSIST_REFUSED_KEY) !== null;
  } catch {
    return false;
  }
}

function rememberRefusal(refused: boolean): void {
  try {
    if (refused) localStorage.setItem(PERSIST_REFUSED_KEY, '1');
    else localStorage.removeItem(PERSIST_REFUSED_KEY);
  } catch {
    // Storage blocked: the state may show "not requested yet" until asked again.
  }
}
