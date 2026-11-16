import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { LOCAL_DB, LocalDb } from '@lister/web/data-access-local-db';
import { newId } from '@lister/shared/domain';
import { SyncEngine } from '@lister/web/data-access-sync';
import { SpacePage } from './space-page';

describe('SpacePage', () => {
  let db: LocalDb;
  beforeEach(() => {
    db = new LocalDb(`test-${newId()}`);
    TestBed.configureTestingModule({
      imports: [SpacePage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: LOCAL_DB, useValue: db },
        { provide: SyncEngine, useValue: { online: signal(true) } },
      ],
    });
  });
  afterEach(async () => {
    TestBed.resetTestingModule();
    await db.delete();
  });

  async function render() {
    const fixture = TestBed.createComponent(SpacePage);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/api/spaces').flush([]);
    const element = fixture.nativeElement as HTMLElement;
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(element.querySelector('#data-heading')).not.toBeNull();
    });
    return element;
  }

  it('links to the trash', async () => {
    const link = [...(await render()).querySelectorAll('a.row-link')].find(
      (a) => a.textContent?.includes('Trash'),
    );
    expect(link?.getAttribute('href')).toBe('/trash');
  });

  it('shows the sections below the spaces only once the device knows its spaces', async () => {
    const fixture = TestBed.createComponent(SpacePage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    // The local database hasn't answered yet: nothing below may be pushed down by it later.
    expect(element.querySelector('#data-heading')).toBeNull();

    TestBed.inject(HttpTestingController).expectOne('/api/spaces').flush([]);
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(element.querySelector('#data-heading')).not.toBeNull();
    });
  });

  it('no longer holds the account, appearance, sync, app or about sections', async () => {
    const text = (await render()).textContent ?? '';
    for (const heading of ['Account', 'Appearance', 'Sync', 'App', 'About']) {
      expect(text).not.toContain(heading);
    }
  });
});
