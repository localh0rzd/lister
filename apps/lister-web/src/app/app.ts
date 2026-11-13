import {
  Component,
  type ElementRef,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { MatToolbar } from '@angular/material/toolbar';
import { isBarePath } from '@lister/web/data-access-auth';
import { NavigationBar, NavigationRail } from '@lister/web/ui';
import { filter, map } from 'rxjs';
import { DESTINATIONS } from './destinations';
import { SyncIndicator } from './sync-indicator';

/** From this width the navigation rail replaces the top app bar and bottom navigation bar. */
export const WIDE_LAYOUT = '(min-width: 600px)';

@Component({
  selector: 'lister-root',
  imports: [
    RouterOutlet,
    MatToolbar,
    NavigationBar,
    NavigationRail,
    SyncIndicator,
  ],
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
  private readonly content =
    viewChild.required<ElementRef<HTMLElement>>('content');
  private readonly router = inject(Router);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );
  /** Sign-in, setup and the forced password change come without the app's navigation. */
  protected readonly bare = computed(() => isBarePath(this.url()));
  /** The top app bar's title on phones: the current destination. */
  protected readonly title = computed(
    () =>
      DESTINATIONS.find((d) => this.url().startsWith(d.path))?.label ??
      'Lister',
  );

  // Focus on a nav link is lost when the layout switches at 600 px (one navigation replaces the
  // other). Accepted: it only happens while resizing or rotating.

  constructor() {
    // <main> is the scroll container, and the router only resets the window's scroll position,
    // so each new page is scrolled to the top here.
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => (this.content().nativeElement.scrollTop = 0));
  }
}
