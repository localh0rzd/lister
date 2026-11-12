import {
  type ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';
import { provideSync } from '@lister/web/data-access-sync';
import { providePwa } from '@lister/web/util-pwa';
import { provideTheme } from '@lister/web/util-theme';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch()),
    provideRouter(appRoutes, withComponentInputBinding()),
    provideTheme(),
    providePwa(),
    provideSync(),
    // Self-hosted Material Symbols (material-symbols on npm), not the Google Fonts ligatures.
    {
      provide: MAT_ICON_DEFAULT_OPTIONS,
      useValue: { fontSet: 'material-symbols-outlined' },
    },
  ],
};
