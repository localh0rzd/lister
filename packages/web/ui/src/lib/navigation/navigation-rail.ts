import { Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import type { NavDestination } from './nav-destination';

/**
 * M3 navigation rail: the main navigation from 600 px. Projected content (e.g. a FAB) goes above
 * the destinations.
 */
@Component({
  selector: 'lister-navigation-rail',
  imports: [RouterLink, RouterLinkActive, MatIcon],
  template: `
    <ng-content />
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
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      width: 80px;
      padding-block: 44px 16px;
      box-sizing: border-box;
      background: var(--mat-sys-surface);
    }
    nav {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .item {
      width: 80px;
    }
    .indicator {
      width: 56px;
    }
  `,
})
export class NavigationRail {
  readonly destinations = input.required<readonly NavDestination[]>();
  readonly label = input('Main');
}
