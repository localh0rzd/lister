import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { SyncEngine } from '@lister/web/data-access-sync';

/**
 * The sync status on the Space page: offline state, changes not synced, the last sync, a
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

  protected readonly state = computed(() => {
    if (this.sync.updateRequired()) return 'Update required';
    if (this.sync.signInRequired()) return 'Signed out: sign in to sync';
    if (!this.sync.online()) return 'Offline';
    return this.sync.syncing() ? 'Syncing…' : 'Online';
  });

  protected readonly pending = computed(() => {
    const count = this.sync.pendingCount();
    if (count === 0) return 'All changes synced';
    return `${count === 1 ? '1 change' : `${count} changes`} not synced`;
  });

  /** Newest first. */
  protected readonly errors = computed(() =>
    [...this.sync.errorLog()].reverse(),
  );
}
