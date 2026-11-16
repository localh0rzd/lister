import { Component, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { apiPath, type HealthResponse } from '@lister/shared/api-contracts';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { AuthSession } from '@lister/web/data-access-auth';
import { ThemePicker } from '@lister/web/ui';
import { Theme } from '@lister/web/util-theme';
import { AppSection } from './app/app-section';
import { SignOutSection } from './sign-out/sign-out-section';
import { SyncSection } from './sync/sync-section';

/** The Settings destination: what belongs to the user and the device, not to a space (D19). */
@Component({
  selector: 'lister-settings-page',
  imports: [
    AppSection,
    MatIcon,
    RouterLink,
    SignOutSection,
    SyncSection,
    ThemePicker,
  ],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage {
  protected readonly theme = inject(Theme);
  protected readonly session = inject(AuthSession);
  protected readonly health = httpResource<HealthResponse>(() =>
    apiPath('health'),
  );
}
