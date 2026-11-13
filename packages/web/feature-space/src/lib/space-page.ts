import { Component, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { apiPath, type HealthResponse } from '@lister/shared/api-contracts';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TRASH_KEEP_DAYS } from '@lister/shared/domain';
import { ThemePicker } from '@lister/web/ui';
import { AuthSession } from '@lister/web/data-access-auth';
import { Theme } from '@lister/web/util-theme';
import { SpacesSection } from './spaces/spaces-section';

/** The Space destination: spaces and members, the account, appearance, data and the API status. */
@Component({
  selector: 'lister-space-page',
  imports: [MatIcon, RouterLink, SpacesSection, ThemePicker],
  templateUrl: './space-page.html',
  styleUrl: './space-page.scss',
})
export class SpacePage {
  protected readonly keepDays = TRASH_KEEP_DAYS;
  protected readonly theme = inject(Theme);
  protected readonly session = inject(AuthSession);
  protected readonly health = httpResource<HealthResponse>(() =>
    apiPath('health'),
  );
}
