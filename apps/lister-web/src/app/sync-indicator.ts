import { Component, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
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
  private readonly router = inject(Router);
  /** The page the user is on: where signing in leads back to. */
  protected readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );
}
