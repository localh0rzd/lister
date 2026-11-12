import { Component, inject, input } from '@angular/core';
import { SyncEngine } from '@lister/web/data-access-sync';
import { SyncBadge } from '@lister/web/ui';

/**
 * The shell's sync indicator. The shell renders it with `@defer`, so the sync engine (Zod,
 * Dexie, Socket.IO) stays out of the initial bundle.
 */
@Component({
  selector: 'lister-sync-indicator',
  imports: [SyncBadge],
  templateUrl: './sync-indicator.html',
})
export class SyncIndicator {
  protected readonly sync = inject(SyncEngine);
  readonly compact = input(false);
}
