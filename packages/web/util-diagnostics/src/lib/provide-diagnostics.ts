import {
  type EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { DiagnosticsCollector } from './diagnostics-collector';

/** Starts the browser-signal logging (network, page lifecycle, service worker) at startup. */
export function provideDiagnostics(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAppInitializer(() => inject(DiagnosticsCollector).start()),
  ]);
}
