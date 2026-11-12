import { Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import type { NavDestination } from './nav-destination';

/** M3 navigation bar: the bottom navigation on phones (below 600 px). */
@Component({
  selector: 'lister-navigation-bar',
  imports: [RouterLink, RouterLinkActive, MatIcon],
  templateUrl: './navigation-bar.html',
  styleUrls: ['./nav-items.scss', './navigation-bar.scss'],
})
export class NavigationBar {
  readonly destinations = input.required<readonly NavDestination[]>();
  readonly label = input('Main');
}
