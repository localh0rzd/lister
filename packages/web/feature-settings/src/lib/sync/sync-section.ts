import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { SyncEngine, rejectionText } from '@lister/web/data-access-sync';

/** How long "Connecting…" shows after "Sync now" while offline. */
export const CONNECTING_HINT_MS = 5000;

/**
 * The sync status on the Settings page: offline state, changes not synced, the last sync, a
 * "Sync now" action and the recent errors (changes the server refused), which stay readable after
 * their snackbar is gone.
 */
@Component({
  selector: 'lister-sync-section',
  imports: [DatePipe, MatButton, MatIcon],
  templateUrl: './sync-section.html',
  styleUrl: './sync-section.scss',
})
export class SyncSection {
  protected readonly sync = inject(SyncEngine);
  /** "Sync now" was used while offline: a connection attempt is on its way. */
  private readonly connecting = signal(false);
  private connectingTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.connectingTimer));
  }

  protected readonly text = rejectionText;

  protected readonly state = computed(() => {
    if (this.sync.updateRequired()) return 'Update required';
    if (this.sync.signInRequired()) return 'Signed out: sign in to sync';
    if (!this.sync.online())
      return this.connecting() ? 'Connecting…' : 'Offline';
    return this.sync.syncing() ? 'Syncing…' : 'Online';
  });

  protected readonly pending = computed(() => {
    const count = this.sync.pendingCount();
    if (count === 0) return 'All changes synced';
    return `${count === 1 ? '1 change' : `${count} changes`} not synced`;
  });

  /**
   * Offline, the attempt to reconnect shows as "Connecting…" for a while, so the click has a
   * visible result.
   */
  protected syncNow(): void {
    if (!this.sync.online()) {
      this.connecting.set(true);
      clearTimeout(this.connectingTimer);
      this.connectingTimer = setTimeout(
        () => this.connecting.set(false),
        CONNECTING_HINT_MS,
      );
    }
    void this.sync.syncNow();
  }

  /** Newest first. */
  protected readonly errors = computed(() =>
    [...this.sync.errorLog()].reverse(),
  );
}
