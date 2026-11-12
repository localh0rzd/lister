import { Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import type { NavDestination } from './nav-destination';

/** M3 navigation bar: the bottom navigation on phones (below 600 px). */
@Component({
  selector: 'lister-navigation-bar',
  imports: [RouterLink, RouterLinkActive, MatIcon],
  template: `
    <nav [attr.aria-label]="label()">
      @for (destination of destinations(); track destination.path) {
        <a
          class="item"
          [routerLink]="destination.path"
          routerLinkActive="active"
          ariaCurrentWhenActive="page"
        >
          <span class="indicator">
            <mat-icon aria-hidden="true">{{ destination.icon }}</mat-icon>
          </span>
          <span class="label">{{ destination.label }}</span>
        </a>
      }
    </nav>
  `,
  styleUrl: './nav-items.scss',
  styles: `
    :host {
      display: block;
      background: var(--mat-sys-surface-container);
      padding-bottom: env(safe-area-inset-bottom);
    }
    nav {
      display: flex;
      height: 80px;
    }
    .item {
      flex: 1;
      justify-content: center;
    }
    .indicator {
      width: 64px;
    }
  `,
})
export class NavigationBar {
  readonly destinations = input.required<readonly NavDestination[]>();
  readonly label = input('Main');
}
