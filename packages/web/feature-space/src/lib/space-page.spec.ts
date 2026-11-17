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
import { SpaceChanges, SyncEngine } from '@lister/web/data-access-sync';
import { Transfers } from '@lister/web/feature-transfer';
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

  /** The Space page of a space holding `lists`, with its export button once it is enabled. */
  async function withLists(lists: { title: string; deletedAt?: number }[]) {
    const spaceId = newId();
    const meta = {
      spaceId,
      version: 1,
      deletedAt: null,
      createdBy: 'u',
      updatedBy: 'u',
      createdAt: 0,
      updatedAt: 0,
    };
    await db.spaces.put({ id: spaceId, name: 'Home', version: 1, members: [] });
    await db.lists.bulkPut(
      lists.map((list) => ({
        ...meta,
        id: newId(),
        description: '',
        ...list,
      })),
    );
    const exportAll = vi
      .spyOn(TestBed.inject(Transfers), 'exportAll')
      .mockImplementation(() => undefined);
    const tell = vi
      .spyOn(TestBed.inject(SpaceChanges), 'tell')
      .mockImplementation(() => undefined);
    const fixture = TestBed.createComponent(SpacePage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    await vi.waitFor(() => {
      for (const call of TestBed.inject(HttpTestingController).match(
        () => true,
      ))
        call.flush([]);
      fixture.detectChanges();
      expect(element.querySelector('#data-heading')).not.toBeNull();
    });
    const button = [...element.querySelectorAll('button.row-link')].find((b) =>
      b.textContent?.includes('Export all lists (JSON)'),
    ) as HTMLButtonElement;
    // Disabled until the local rows are read, so a click never lands on "not ready".
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(button.disabled).toBe(false);
    });
    return { button, exportAll, tell };
  }

  it('exports every list of the space as JSON from the local rows', async () => {
    const { button, exportAll } = await withLists([
      { title: 'Camping' },
      { title: 'Old', deletedAt: 3 },
    ]);

    button.click();

    expect(exportAll).toHaveBeenCalledTimes(1);
    expect(exportAll.mock.calls[0][0].map((l) => l.title)).toEqual(['Camping']);
  });

  it('says so, and downloads nothing, when the space has no lists', async () => {
    const { button, exportAll, tell } = await withLists([
      { title: 'Old', deletedAt: 3 },
    ]);

    button.click();

    expect(exportAll).not.toHaveBeenCalled();
    expect(tell).toHaveBeenCalledWith('There are no lists to export');
  });
});
