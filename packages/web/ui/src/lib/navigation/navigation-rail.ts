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
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      width: 80px;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-medium);
      text-decoration: none;
      outline: none;
    }
    .indicator {
      display: grid;
      place-items: center;
      width: 56px;
      height: 32px;
      border-radius: var(--mat-sys-corner-full);
    }
    .item:hover .indicator {
      background: color-mix(in srgb, var(--mat-sys-on-surface) 8%, transparent);
    }
    .item:focus-visible .indicator {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: 2px;
    }
    .item.active {
      color: var(--mat-sys-on-surface);
      font-weight: 700;
    }
    .item.active .indicator {
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }
    .item.active mat-icon {
      font-variation-settings: 'FILL' 1;
    }
  `,
})
export class NavigationRail {
  readonly destinations = input.required<readonly NavDestination[]>();
  readonly label = input('Main');
}
