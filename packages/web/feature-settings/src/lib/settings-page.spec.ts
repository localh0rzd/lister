import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatButtonToggleHarness } from '@angular/material/button-toggle/testing';
import type { HealthResponse } from '@lister/shared/api-contracts';
import { THEME_STORAGE_KEY } from '@lister/web/util-theme';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { AuthSession } from '@lister/web/data-access-auth';
import { SyncEngine } from '@lister/web/data-access-sync';
import { SettingsPage } from './settings-page';

const user = signal({
  id: 'u1',
  username: 'anna',
  displayName: 'Anna',
  isAdmin: false,
  mustChangePassword: false,
});

describe('SettingsPage', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.colorScheme = '';
    user.update((u) => ({ ...u, isAdmin: false }));
    TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: SyncEngine,
          useValue: {
            online: signal(true),
            syncing: signal(false),
            pendingCount: signal(0),
            lastSyncedAt: signal(null),
            signInRequired: signal(false),
            updateRequired: signal(false),
            errorLog: signal([]),
          },
        },
        {
          provide: AuthSession,
          useValue: { user, isAdmin: () => user().isAdmin },
        },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());

  async function render() {
    const fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/health')
      .flush({
        status: 'ok',
        service: 'lister-api',
        db: 'ok',
        timestamp: new Date().toISOString(),
      } satisfies HealthResponse);
    await fixture.whenStable();
    return fixture;
  }

  it('shows the API status', async () => {
    const fixture = await render();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('ok');
  });

  it('has the sections of D19, with Sign out last', async () => {
    const fixture = await render();
    const headings = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('h2'),
    ].map((h) => h.textContent?.trim());
    expect(headings).toEqual([
      'Account',
      'Appearance',
      'Sync',
      'App',
      'About',
      'Sign out',
    ]);
  });

  it('switches to the dark theme and remembers it', async () => {
    const fixture = await render();
    const loader = TestbedHarnessEnvironment.loader(fixture);

    const dark = await loader.getHarness(
      MatButtonToggleHarness.with({ text: /Dark/ }),
    );
    await dark.check();
    TestBed.tick();

    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('links to the profile, and to user administration only for admins', async () => {
    const fixture = await render();
    const links = () =>
      [
        ...(fixture.nativeElement as HTMLElement).querySelectorAll(
          'a.row-link',
        ),
      ].map((a) => a.getAttribute('href'));

    expect(links()).toContain('/profile');
    expect(links()).not.toContain('/users');

    user.update((u) => ({ ...u, isAdmin: true }));
    await fixture.whenStable();
    expect(links()).toContain('/users');
  });
});
