import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { RouterOutlet } from '@angular/router';
import { MatToolbar } from '@angular/material/toolbar';
import { NavigationBar, NavigationRail } from '@lister/web/ui';
import { map } from 'rxjs';
import { DESTINATIONS } from './destinations';

/** From this width the navigation rail replaces the top app bar and bottom navigation bar. */
export const WIDE_LAYOUT = '(min-width: 600px)';

@Component({
  selector: 'lister-root',
  imports: [RouterOutlet, MatToolbar, NavigationBar, NavigationRail],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly breakpoints = inject(BreakpointObserver);
  protected readonly destinations = DESTINATIONS;
  protected readonly wide = toSignal(
    this.breakpoints.observe(WIDE_LAYOUT).pipe(map((state) => state.matches)),
    { initialValue: this.breakpoints.isMatched(WIDE_LAYOUT) },
  );
}
