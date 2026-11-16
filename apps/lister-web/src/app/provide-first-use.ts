import {
  EnvironmentInjector,
  type EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';

/** Starts `FirstUse` after boot, from a lazy chunk. */
export function provideFirstUse(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAppInitializer(() => {
      const injector = inject(EnvironmentInjector);
      void import('./first-use').then(({ FirstUse }) => injector.get(FirstUse));
    }),
  ]);
}
