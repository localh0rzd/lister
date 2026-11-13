import { EnvironmentInjector, Service, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { DOCUMENT } from '@angular/common';
import { AuthSession, isBarePath } from '@lister/web/data-access-auth';
import { DISCARDED_CHANGES_KEY } from '@lister/web/data-access-local-db';
import { NOTICE_DURATION_MS, Notifier } from '@lister/web/util-notify';
import { SyncEngine } from './sync-engine';

/**
 * Shows every change the server refused as a snackbar with its reason, once per tab, and then
 * dismisses it, so it isn't shown again after a reload or in other tabs (design §2.4: invalid
 * changes are rejected with a notice). The change itself was already rolled back by the engine.
 */
@Service()
export class RejectionNotices {
  private readonly engine = inject(SyncEngine);
  private readonly notifier = inject(Notifier);
  private readonly router = inject(Router);
  private readonly session = inject(AuthSession);
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly injector = inject(EnvironmentInjector);
  /** The current URL as a signal, so the sign-in notice reacts to navigating. */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );
  private readonly shown = new Set<string>();
  private started = false;
  private askedToSignIn = false;

  /** Starts the engine too. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.engine.start();
    this.tellAboutDiscardedChanges();
    effect(
      () => {
        for (const error of this.engine.errors()) {
          if (this.shown.has(error.mutationId)) continue;
          this.shown.add(error.mutationId);
          void this.notifier
            .notify({
              message: `Change not saved: ${error.reason}`,
              action: 'OK',
              duration: NOTICE_DURATION_MS,
            })
            .then(() => this.engine.dismissError(error.mutationId));
        }
      },
      { injector: this.injector },
    );
    // A session that ended while the app was open (or offline): the app keeps working, so ask
    // once, and stay out of the way afterwards (the sync badge says "Sign in" until then).
    effect(
      () => {
        if (!this.engine.signInRequired()) {
          this.askedToSignIn = false;
          return;
        }
        // On the sign-in pages the user is already being asked.
        // Only somebody who was signed in is asked: a visitor who never signed in is already
        // being sent to the sign-in page.
        if (
          this.askedToSignIn ||
          !this.session.user() ||
          isBarePath(this.url())
        )
          return;
        this.askedToSignIn = true;
        void this.notifier
          .notify({
            message:
              'Your session has ended. Sign in to sync your changes; nothing is lost.',
            action: 'Sign in',
          })
          .then((outcome) => {
            if (outcome === 'action')
              void this.router.navigate(['/sign-in'], {
                queryParams: { returnUrl: this.router.url },
              });
          });
      },
      { injector: this.injector },
    );
  }

  /** Signing in as somebody else wiped the previous user's unsynced changes: say so, once. */
  private tellAboutDiscardedChanges(): void {
    let count: number;
    try {
      count = Number(this.window?.localStorage.getItem(DISCARDED_CHANGES_KEY));
      this.window?.localStorage.removeItem(DISCARDED_CHANGES_KEY);
    } catch {
      return;
    }
    if (!(count > 0)) return;
    void this.notifier.notify({
      message: `${count === 1 ? '1 unsynced change' : `${count} unsynced changes`} of the previous user on this device ${count === 1 ? 'was' : 'were'} discarded.`,
      action: 'OK',
      duration: NOTICE_DURATION_MS,
    });
  }
}
