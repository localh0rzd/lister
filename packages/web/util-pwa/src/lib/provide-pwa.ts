import {
  EnvironmentInjector,
  type EnvironmentProviders,
  inject,
  isDevMode,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';

/**
 * The service worker (production builds only; the dev server has none) and update handling.
 * `AppUpdates` (with the Material snackbar) is loaded after bootstrap, so it stays out of the
 * initial bundle.
 */
export function providePwa(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideAppInitializer(() => {
      const injector = inject(EnvironmentInjector);
      void import('./app-updates').then(({ AppUpdates }) =>
        injector.get(AppUpdates),
      );
    }),
  ]);
}
