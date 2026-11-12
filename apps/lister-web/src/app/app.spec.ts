import { TestBed } from '@angular/core/testing';
import { BreakpointObserver, type BreakpointState } from '@angular/cdk/layout';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Component } from '@angular/core';
import { of } from 'rxjs';
import { App } from './app';

@Component({ template: '<h1>Page</h1>' })
class Page {}

function setup(wide: boolean) {
  TestBed.configureTestingModule({
    imports: [App],
    providers: [
      provideRouter([
        { path: 'lists', component: Page },
        { path: 'runs', component: Page },
        { path: 'space', component: Page },
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

async function render() {
  await RouterTestingHarness.create('/lists');
  const fixture = TestBed.createComponent(App);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('App shell', () => {
  it('shows a top app bar and the bottom navigation bar on phones', async () => {
    setup(false);
    const el = await render();

    expect(el.querySelector('[role="banner"]')?.textContent).toContain(
      'Lister',
    );
    expect(el.querySelector('lister-navigation-bar')).not.toBeNull();
    expect(el.querySelector('lister-navigation-rail')).toBeNull();
  });

  it('shows the navigation rail from 600 px', async () => {
    setup(true);
    const el = await render();

    expect(el.querySelector('lister-navigation-rail')).not.toBeNull();
    expect(el.querySelector('lister-navigation-bar')).toBeNull();
    expect(el.querySelector('[role="banner"]')).toBeNull();
  });

  it('offers Lists, Runs and Space', async () => {
    setup(true);
    const el = await render();

    const labels = [...el.querySelectorAll('nav a .label')].map((l) =>
      l.textContent?.trim(),
    );
    expect(labels).toEqual(['Lists', 'Runs', 'Space']);
    expect(el.querySelector('main')).not.toBeNull();
  });
});
