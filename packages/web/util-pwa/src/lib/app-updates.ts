import {
  DOCUMENT,
  InjectionToken,
  Service,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate } from '@angular/service-worker';
import { Notifier } from '@lister/web/util-notify';
import { filter, fromEvent, interval, merge } from 'rxjs';

/** How often a long-open app asks the server for a new version. */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** Reloads the page. A token so tests can observe it. */
export const PAGE_RELOAD = new InjectionToken<() => void>('PAGE_RELOAD', {
  providedIn: 'root',
  factory: () => {
    const document = inject(DOCUMENT);
    return () => document.location.reload();
  },
});

/**
 * Offers "New version available — Reload" once the service worker has downloaded a new version,
 * and a reload when the cached version is broken. Checks for updates hourly and whenever the app
 * comes back to the foreground.
 *
 * The prompt is a sticky notice (`Notifier`): other notices go first and it comes back after
 * them. If the user swipes it away, it's offered again at the next check.
 */
@Service()
export class AppUpdates {
  private readonly updates = inject(SwUpdate);
  private readonly notifier = inject(Notifier);
  private readonly reload = inject(PAGE_RELOAD);
  private readonly document = inject(DOCUMENT);

  /** The message of a reload that is waiting for the user, if any. */
  private readonly pendingReload = signal<string | null>(null);
  private showing = false;
  /** Counts prompts, so only the latest one's outcome counts. */
  private calls = 0;

  constructor() {
    if (!this.updates.isEnabled) return;

    this.updates.versionUpdates
      .pipe(
        filter((event) => event.type === 'VERSION_READY'),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.offerReload('New version available'));

    this.updates.unrecoverable
      .pipe(takeUntilDestroyed())
      .subscribe(() =>
        this.offerReload('Lister needs to reload to keep working'),
      );

    merge(
      interval(UPDATE_CHECK_INTERVAL_MS),
      fromEvent(this.document, 'visibilitychange').pipe(
        filter(() => this.document.visibilityState === 'visible'),
      ),
    )
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        const pending = this.pendingReload();
        if (pending && !this.showing) {
          this.offerReload(pending);
          return;
        }
        // Offline or a failed check: try again next time.
        this.updates.checkForUpdate().catch(() => undefined);
      });
  }

  /**
   * The server no longer speaks this app's protocol: look for a new version at once. If the
   * service worker found one, its "New version available" prompt follows; otherwise (no service
   * worker, or nothing newer cached) ask for a reload, which fetches the current app.
   */
  async updateRequired(): Promise<void> {
    if (this.updates.isEnabled) {
      try {
        if (await this.updates.checkForUpdate()) return;
      } catch {
        // Offline or a failed check: the reload prompt below still works.
      }
    }
    this.offerReload('Lister needs an update to keep syncing');
  }

  private offerReload(message: string): void {
    this.pendingReload.set(message);
    this.showing = true;
    const call = ++this.calls;
    // Sticky: the notifier lets Undo and other notices go first, then shows it again.
    void this.notifier.notify({ message, action: 'Reload' }).then((outcome) => {
      // A newer prompt replaced this one: it decides from now on.
      if (call !== this.calls) return;
      this.showing = false;
      if (outcome === 'action') this.reload();
    });
  }
}
