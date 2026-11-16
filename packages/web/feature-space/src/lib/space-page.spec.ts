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
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('links to the trash', async () => {
    const link = [...(await render()).querySelectorAll('a.row-link')].find(
      (a) => a.textContent?.includes('Trash'),
    );
    expect(link?.getAttribute('href')).toBe('/trash');
  });

  it('no longer holds the account, appearance, sync, app or about sections', async () => {
    const text = (await render()).textContent ?? '';
    for (const heading of ['Account', 'Appearance', 'Sync', 'App', 'About']) {
      expect(text).not.toContain(heading);
    }
  });
});
