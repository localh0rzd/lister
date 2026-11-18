import {
  type ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';
import { provideSync } from '@lister/web/data-access-sync';
import {
  diagnosticsInterceptor,
  provideDiagnostics,
} from '@lister/web/util-diagnostics';
import { providePwa } from '@lister/web/util-pwa';
import { provideTheme } from '@lister/web/util-theme';
import { provideFirstUse } from './provide-first-use';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideDiagnostics(),
    provideHttpClient(withFetch(), withInterceptors([diagnosticsInterceptor])),
    provideRouter(appRoutes, withComponentInputBinding()),
    provideTheme(),
    providePwa(),
    provideSync(),
    provideFirstUse(),
    // Self-hosted Material Symbols (material-symbols on npm), not the Google Fonts ligatures.
    {
      provide: MAT_ICON_DEFAULT_OPTIONS,
      useValue: { fontSet: 'material-symbols-outlined' },
    },
  ],
};
