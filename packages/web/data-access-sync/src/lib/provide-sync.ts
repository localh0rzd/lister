import {
  EnvironmentInjector,
  type EnvironmentProviders,
  PLATFORM_ID,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Starts the sync engine after the app boots in a browser. The engine is loaded with a dynamic
 * import, so Zod, Dexie and Socket.IO stay out of the initial bundle and the shell renders first.
 */
export function provideSync(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAppInitializer(() => {
      if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
      const injector = inject(EnvironmentInjector);
      void import('./sync-engine').then(({ SyncEngine }) =>
        injector.get(SyncEngine).start(),
      );
    }),
  ]);
}
