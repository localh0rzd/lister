import { Component, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { NavDestination } from './nav-destination';
import { NavigationBar } from './navigation-bar';
import { NavigationRail } from './navigation-rail';

@Component({ template: '' })
class Page {}

const destinations: NavDestination[] = [
  { path: '/lists', label: 'Lists', icon: 'checklist' },
  { path: '/runs', label: 'Runs', icon: 'playlist_add_check' },
  { path: '/space', label: 'Space', icon: 'group' },
  { path: '/settings', label: 'Settings', icon: 'settings' },
];

describe.each([
  ['NavigationBar', NavigationBar],
  ['NavigationRail', NavigationRail],
] as [string, Type<NavigationBar | NavigationRail>][])('%s', (_, component) => {
  async function setup(url: string) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          ...destinations.map((d) => ({
            path: d.path.slice(1),
            component: Page,
          })),
          { path: 'settings/profile', component: Page },
        ]),
      ],
    });
    const harness = await RouterTestingHarness.create(url);
    const fixture = TestBed.createComponent(component);
    fixture.componentRef.setInput('destinations', destinations);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const links = () => [...element.querySelectorAll('a')];
    return { harness, fixture, element, links };
  }

  it('renders a labelled navigation landmark with one link per destination', async () => {
    const { element, links } = await setup('/lists');

    expect(element.querySelector('nav')?.getAttribute('aria-label')).toBe(
      'Main',
    );
    expect(
      links().map((a) => a.querySelector('.label')?.textContent?.trim()),
    ).toEqual(['Lists', 'Runs', 'Space', 'Settings']);
    expect(links().map((a) => a.getAttribute('href'))).toEqual([
      '/lists',
      '/runs',
      '/space',
      '/settings',
    ]);
  });

  it('marks the active destination with aria-current', async () => {
    const { harness, fixture, links } = await setup('/lists');
    expect(links().map((a) => a.getAttribute('aria-current'))).toEqual([
      'page',
      null,
      null,
      null,
    ]);

    await harness.navigateByUrl('/space');
    await fixture.whenStable();

    expect(links().map((a) => a.getAttribute('aria-current'))).toEqual([
      null,
      null,
      'page',
      null,
    ]);
  });

  it('keeps Settings active on pages under /settings', async () => {
    const { harness, fixture, links } = await setup('/lists');

    await harness.navigateByUrl('/settings/profile');
    await fixture.whenStable();

    expect(links().map((a) => a.getAttribute('aria-current'))).toEqual([
      null,
      null,
      null,
      'page',
    ]);
  });

  it('navigates when a destination is activated', async () => {
    const { fixture, links } = await setup('/lists');

    links()[1].click();
    await fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/runs');
    expect(links()[1].getAttribute('aria-current')).toBe('page');
  });
});
