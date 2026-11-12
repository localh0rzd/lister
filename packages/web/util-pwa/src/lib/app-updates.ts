import {
  DOCUMENT,
  type EnvironmentProviders,
  InjectionToken,
  Service,
  inject,
  isDevMode,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SwUpdate, provideServiceWorker } from '@angular/service-worker';
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
 */
@Service()
export class AppUpdates {
  private readonly updates = inject(SwUpdate);
  private readonly snackBar = inject(MatSnackBar);
  private readonly reload = inject(PAGE_RELOAD);
  private readonly document = inject(DOCUMENT);

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
        // Offline or a failed check: try again next time.
        this.updates.checkForUpdate().catch(() => undefined);
      });
  }

  private offerReload(message: string): void {
    this.snackBar
      .open(message, 'Reload')
      .onAction()
      .subscribe(() => this.reload());
  }
}

/**
 * The service worker (production builds only; the dev server has none) and update handling.
 */
export function providePwa(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideAppInitializer(() => {
      inject(AppUpdates);
    }),
  ]);
}
