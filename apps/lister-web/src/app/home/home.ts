import { Component, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { apiPath, type HealthResponse } from '@lister/shared/api-contracts';
import { ThemePicker } from '@lister/web/ui';
import { Theme } from '@lister/web/util-theme';

// Placeholder start page. T-002 moves the API status and the appearance setting to Space.
@Component({
  selector: 'lister-home',
  imports: [ThemePicker],
  template: `
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

    <section aria-labelledby="appearance-heading">
      <h2 id="appearance-heading">Appearance</h2>
      <lister-theme-picker
        [value]="theme.preference()"
        (valueChange)="theme.setPreference($event)"
      />
    </section>
  `,
  styles: `
    .ok {
      color: var(--mat-sys-primary);
    }
    .down {
      color: var(--mat-sys-error);
    }
    h2 {
      font: var(--mat-sys-title-medium);
    }
  `,
})
export class Home {
  protected readonly theme = inject(Theme);
  protected readonly health = httpResource<HealthResponse>(() =>
    apiPath('health'),
  );
}
