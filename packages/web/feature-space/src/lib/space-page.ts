import { Component, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { apiPath, type HealthResponse } from '@lister/shared/api-contracts';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { ThemePicker } from '@lister/web/ui';
import { Theme } from '@lister/web/util-theme';

// Members and sharing arrive with T-024/T-026; for now: appearance and the API status.
@Component({
  selector: 'lister-space-page',
  imports: [MatIcon, RouterLink, ThemePicker],
  template: `
    <h1 class="page-title">Space</h1>

    <section aria-labelledby="appearance-heading">
      <h2 id="appearance-heading">Appearance</h2>
      <lister-theme-picker
        [value]="theme.preference()"
        (valueChange)="theme.setPreference($event)"
      />
    </section>

    <section aria-labelledby="data-heading">
      <h2 id="data-heading">Data</h2>
      <a class="row-link" routerLink="trash">
        <mat-icon aria-hidden="true">delete</mat-icon>
        <span class="row-text">
          <span>Trash</span>
          <span class="row-hint">Deleted lists and items, for 30 days</span>
        </span>
        <mat-icon aria-hidden="true">chevron_right</mat-icon>
      </a>
    </section>

    <section aria-labelledby="about-heading">
      <h2 id="about-heading">About</h2>
      <p>
        API status:
        @if (health.isLoading()) {
          <span>checking…</span>
        } @else if (health.error()) {
          <span class="down">unreachable</span>
        } @else if (health.hasValue()) {
          <span class="ok">{{ health.value().status }}</span>
        }
      </p>
    </section>
  `,
  styles: `
    h2 {
      font: var(--mat-sys-title-medium);
      margin-block: 24px 12px;
    }
    .row-link {
      display: flex;
      align-items: center;
      gap: 16px;
      min-height: 56px;
      padding-inline: 4px;
      color: var(--mat-sys-on-surface);
      text-decoration: none;
      border-radius: var(--mat-sys-corner-small);
    }
    .row-link:hover {
      background: var(--mat-sys-surface-container-high);
    }
    .row-text {
      flex: 1;
      display: flex;
      flex-direction: column;
      font: var(--mat-sys-body-large);
    }
    .row-hint {
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .ok {
      color: var(--mat-sys-primary);
    }
    .down {
      color: var(--mat-sys-error);
    }
  `,
})
export class SpacePage {
  protected readonly theme = inject(Theme);
  protected readonly health = httpResource<HealthResponse>(() =>
    apiPath('health'),
  );
}
