import {
  DOCUMENT,
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
      // Chromium's install prompt can fire before the InstallPrompt chunk has loaded, and only
      // once per page load: keep it from the start and hand it over.
      const win = inject(DOCUMENT).defaultView;
      let early: Event | undefined;
      const keep = (event: Event) => {
        event.preventDefault();
        early = event;
      };
      win?.addEventListener('beforeinstallprompt', keep);
      void import('./install-prompt').then(({ InstallPrompt }) => {
        const prompts = injector.get(InstallPrompt);
        win?.removeEventListener('beforeinstallprompt', keep);
        if (early) prompts.offer(early);
      });
    }),
  ]);
}
