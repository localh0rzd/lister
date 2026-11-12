import { Component, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { apiPath, type HealthResponse } from '@lister/shared/api-contracts';
import { ThemePicker } from '@lister/web/ui';
import { Theme } from '@lister/web/util-theme';

// Members and sharing arrive with T-024/T-026; for now: appearance and the API status.
@Component({
  selector: 'lister-space-page',
  imports: [ThemePicker],
  template: `
    <h1 class="page-title">Space</h1>

    <section aria-labelledby="appearance-heading">
      <h2 id="appearance-heading">Appearance</h2>
      <lister-theme-picker
        [value]="theme.preference()"
        (valueChange)="theme.setPreference($event)"
      />
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
