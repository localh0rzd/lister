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
  templateUrl: './navigation-rail.html',
  styleUrls: ['./navigation-rail.scss', './nav-items.scss'],
})
export class NavigationRail {
  readonly destinations = input.required<readonly NavDestination[]>();
  readonly label = input('Main');
}
