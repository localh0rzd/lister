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
import { LOCAL_DB, LocalDb } from '@lister/web/data-access-local-db';
import { newId } from '@lister/shared/domain';
import { SyncEngine } from '@lister/web/data-access-sync';
import { SpacePage } from './space-page';

const user = signal({
  id: 'u1',
  username: 'anna',
  displayName: 'Anna',
  isAdmin: false,
  mustChangePassword: false,
});

describe('SpacePage', () => {
  let db: LocalDb;
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.colorScheme = '';
    db = new LocalDb(`test-${newId()}`);
    user.update((u) => ({ ...u, isAdmin: false }));
    TestBed.configureTestingModule({
      imports: [SpacePage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: LOCAL_DB, useValue: db },
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
  afterEach(async () => {
    TestBed.resetTestingModule();
    await db.delete();
  });

  function flushHealth() {
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/spaces').flush([]);
    http.expectOne('/api/health').flush({
      status: 'ok',
      service: 'lister-api',
      db: 'ok',
      timestamp: new Date().toISOString(),
    } satisfies HealthResponse);
  }

  it('shows the API status', async () => {
    const fixture = TestBed.createComponent(SpacePage);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    flushHealth();
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('ok');
    http.verify();
  });

  it('switches to the dark theme and remembers it', async () => {
    const fixture = TestBed.createComponent(SpacePage);
    fixture.detectChanges();
    flushHealth();
    await fixture.whenStable();
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
    const fixture = TestBed.createComponent(SpacePage);
    fixture.detectChanges();
    flushHealth();
    await fixture.whenStable();
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

  it('links to the trash', async () => {
    const fixture = TestBed.createComponent(SpacePage);
    fixture.detectChanges();
    flushHealth();
    await fixture.whenStable();

    const link = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('a.row-link'),
    ].find((a) => a.textContent?.includes('Trash'));
    expect(link?.textContent).toContain('Trash');
    expect(link?.getAttribute('href')).toBe('/trash');
  });
});
