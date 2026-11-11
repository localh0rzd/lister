import { ChangeDetectionStrategy, Component } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { apiPath, type HealthResponse } from '@lister/shared/api-contracts';

@Component({
  selector: 'lister-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  `,
  styles: `
    .ok {
      color: green;
    }
    .down {
      color: crimson;
    }
  `,
})
export class Home {
  protected readonly health = httpResource<HealthResponse>(() =>
    apiPath('health'),
  );
}
