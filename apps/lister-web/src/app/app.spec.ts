import { DeferBlockBehavior, TestBed } from '@angular/core/testing';
import { BreakpointObserver, type BreakpointState } from '@angular/cdk/layout';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Component } from '@angular/core';
import { of } from 'rxjs';
import { App } from './app';

@Component({ template: '<h1>Page</h1>' })
class Page {}

function setup(wide: boolean, canActivate: (() => Promise<boolean>)[] = []) {
  TestBed.configureTestingModule({
    // The deferred sync indicator needs the sync engine; it has its own tests.
    deferBlockBehavior: DeferBlockBehavior.Manual,
    imports: [App],
    providers: [
      provideRouter([
        { path: 'lists', component: Page, canActivate },
        { path: 'lists/:id', component: Page },
        { path: 'runs', component: Page },
        { path: 'space', component: Page },
        { path: 'settings', component: Page },
        { path: 'sign-in', component: Page },
        { path: 'change-password', component: Page },
      ]),
      {
        provide: BreakpointObserver,
        useValue: {
          isMatched: () => wide,
          observe: () =>
            of({ matches: wide, breakpoints: {} } as BreakpointState),
        },
      },
    ],
  });
}

async function render(url = '/lists') {
  await RouterTestingHarness.create(url);
  const fixture = TestBed.createComponent(App);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('App shell', () => {
  it('shows a top app bar and the bottom navigation bar on phones', async () => {
    setup(false);
    const el = await render();

    expect(el.querySelector('header')?.textContent).toContain('Lists');
    expect(el.querySelector('lister-navigation-bar')).not.toBeNull();
    expect(el.querySelector('lister-navigation-rail')).toBeNull();
  });

  it('shows the navigation rail from 600 px', async () => {
    setup(true);
    const el = await render();

    expect(el.querySelector('lister-navigation-rail')).not.toBeNull();
    expect(el.querySelector('lister-navigation-bar')).toBeNull();
    expect(el.querySelector('mat-toolbar')).toBeNull();
  });

  // The search field itself is deferred (it needs the local database), so these look at the
  // placeholder that holds its place until it arrives.
  it.each([
    ['/lists', true],
    ['/lists/abc', true],
    ['/runs', true],
    ['/space', false],
    ['/settings', false],
  ])(
    'on %s the wide layout has an app bar for search: %s',
    async (url, shown) => {
      setup(true);
      const el = await render(url);

      expect(el.querySelector('.top-bar') !== null).toBe(shown);
      expect(el.querySelector('.top-bar .search-placeholder') !== null).toBe(
        shown,
      );
    },
  );

  it.each([
    ['/lists', true],
    ['/runs', true],
    ['/space', false],
  ])(
    'on %s the phone app bar makes room for search: %s',
    async (url, shown) => {
      setup(false);
      const el = await render(url);

      expect(el.querySelector('header .search-placeholder') !== null).toBe(
        shown,
      );
      expect(el.querySelector('header .spacer')).not.toBeNull();
    },
  );

  it('starts every destination at the top', async () => {
    setup(true);
    const harness = await RouterTestingHarness.create('/lists');
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const main = (fixture.nativeElement as HTMLElement).querySelector('main');
    if (!main) throw new Error('no <main>');
    main.scrollTop = 500;

    await harness.navigateByUrl('/runs');

    expect(main.scrollTop).toBe(0);
  });

  it('offers Lists, Runs, Space and Settings', async () => {
    setup(true);
    const el = await render();

    const labels = [...el.querySelectorAll('nav a .label')].map((l) =>
      l.textContent?.trim(),
    );
    expect(labels).toEqual(['Lists', 'Runs', 'Space', 'Settings']);
    expect(el.querySelector('main')).not.toBeNull();
  });

  it.each(['/sign-in', '/sign-in?returnUrl=%2Flists', '/change-password'])(
    'shows %s without navigation, on phones and wide screens',
    async (url) => {
      for (const wide of [false, true]) {
        TestBed.resetTestingModule();
        setup(wide);
        const el = await render(url);

        expect(el.querySelector('main h1')?.textContent).toBe('Page');
        expect(el.querySelector('lister-navigation-bar')).toBeNull();
        expect(el.querySelector('lister-navigation-rail')).toBeNull();
        expect(el.querySelector('header')).toBeNull();
      }
    },
  );

  it('shows no navigation while the first page is still being decided (e.g. the sign-in check)', async () => {
    let allow!: (ok: boolean) => void;
    setup(true, [() => new Promise<boolean>((resolve) => (allow = resolve))]);
    const fixture = TestBed.createComponent(App);
    const el = fixture.nativeElement as HTMLElement;
    const router = TestBed.inject(Router);
    const navigation = router.navigateByUrl('/lists');
    await vi.waitFor(() => expect(allow).toBeTypeOf('function'));
    // The guard is still waiting: the router counts as busy, so there is no whenStable() yet.
    fixture.detectChanges();

    expect(el.querySelector('lister-navigation-rail')).toBeNull();

    allow(true);
    await navigation;
    await fixture.whenStable();
    expect(el.querySelector('lister-navigation-rail')).not.toBeNull();
  });
});
