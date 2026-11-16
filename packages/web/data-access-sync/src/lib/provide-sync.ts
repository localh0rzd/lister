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
 * The app's Content Security Policy forbids eval (design §2.9). Zod decides whether to compile
 * object schemas with `new Function` when it creates them, and that probe reports a CSP
 * violation even though Zod catches the error. So `jitless` is set here, in the initial bundle,
 * before any lazy chunk creates a schema. Zod reads its settings from this global
 * (`globalConfig` in `zod/v4/core`); importing Zod's `config()` instead would pull ~400 kB of
 * Zod into the initial bundle. The provide-sync spec checks that Zod sees the setting.
 */
const zodGlobal = globalThis as {
  __zod_globalConfig?: { jitless?: boolean };
};
(zodGlobal.__zod_globalConfig ??= {}).jitless = true;

/**
 * Starts the sync engine after the app boots in a browser, with notices for the changes the
 * server refuses (`RejectionNotices`, which starts the engine through its injection). The engine is loaded with a dynamic
 * import, so Zod, Dexie and Socket.IO stay out of the initial bundle and the shell renders first.
 */
export function provideSync(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAppInitializer(() => {
      if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
      const injector = inject(EnvironmentInjector);
      void import('./rejection-notices').then(({ RejectionNotices }) => {
        injector.get(RejectionNotices).start();
      });
    }),
  ]);
}
