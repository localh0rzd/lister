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
 * The service worker (production builds only; the dev server has none), update handling and the
 * install prompt. `AppUpdates` and `InstallPrompt` are loaded after bootstrap, so they stay out of
 * the initial bundle.
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
      // The browser's install prompt fires early, so it's caught from the start.
      void import('./install-prompt').then(({ InstallPrompt }) =>
        injector.get(InstallPrompt),
      );
    }),
  ]);
}
