import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { type Run, type RunItem, newId } from '@lister/shared/domain';
import { LOCAL_DB, LocalDb } from '@lister/web/data-access-local-db';
import { type MutationRequest, SyncEngine } from '@lister/web/data-access-sync';
import { Notifier } from '@lister/web/util-notify';
import { of } from 'rxjs';
import { RunsPage } from './runs-page';

const SPACE = newId();
const meta = {
  spaceId: SPACE,
  version: 1,
  deletedAt: null,
  createdBy: 'u',
  updatedBy: 'u',
  createdAt: 0,
  updatedAt: 0,
};
const run = (title: string, extra: Partial<Run> = {}): Run => ({
  ...meta,
  id: newId(),
  title,
  sourceListId: null,
  finishedAt: null,
  ...extra,
});
const runItem = (runId: string, state: RunItem['state']): RunItem => ({
  ...meta,
  id: newId(),
  runId,
  title: newId(),
  quantity: '',
  note: '',
  position: 'a0',
  sources: [],
  state,
  stateBy: null,
  stateAt: null,
  mergedInto: null,
});

let db: LocalDb;
let requests: MutationRequest[];
let dialogAnswer: unknown;
let open: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  db = new LocalDb(`test-${newId()}`);
  requests = [];
  dialogAnswer = undefined;
  open = vi.fn(() => ({ afterClosed: () => of(dialogAnswer) }));
});
afterEach(async () => {
  TestBed.resetTestingModule();
  await db.delete();
});

async function render() {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: LOCAL_DB, useValue: db },
      {
        provide: SyncEngine,
        useValue: {
          mutate: vi.fn(async (request: MutationRequest) => {
            requests.push(request);
            return { ok: true };
          }),
        },
      },
      {
        provide: Notifier,
        useValue: { notify: vi.fn(async () => 'dismissed') },
      },
      { provide: MatDialog, useValue: { open } },
    ],
  });
  const navigate = vi
    .spyOn(TestBed.inject(Router), 'navigate')
    .mockResolvedValue(true);
  const fixture = TestBed.createComponent(RunsPage);
  const element = fixture.nativeElement as HTMLElement;
  const settle = (check: () => void) =>
    vi.waitFor(async () => {
      await fixture.whenStable();
      check();
    });
  await settle(() =>
    expect(element.querySelector('lister-loading-hint')).toBeNull(),
  );
  return { fixture, element, settle, navigate };
}

const withSpace = () =>
  db.spaces.put({ id: SPACE, name: 'Home', version: 1, members: [] });

describe('RunsPage', () => {
  it('shows the Runs heading', async () => {
    const page = await render();
    expect(page.element.querySelector('h1')?.textContent).toBe('Runs');
  });

  it('says so before the first connection, without offering New run', async () => {
    const page = await render();
    expect(page.element.textContent).toContain('once Lister has connected');
    expect(page.element.textContent).not.toContain('New run');
  });

  it('shows an empty state with New run', async () => {
    await withSpace();
    const page = await render();
    await page.settle(() =>
      expect(page.element.textContent).toContain('No active runs'),
    );
    expect(page.element.textContent).toContain('New run');
  });

  it('shows the active runs, newest first, with progress — never finished ones', async () => {
    await withSpace();
    const alps = run('Alps', { createdAt: 1 });
    await db.runs.bulkPut([
      alps,
      run('Groceries', { createdAt: 2 }),
      run('Finished', { createdAt: 3, finishedAt: 3 }),
    ]);
    await db.runItems.bulkPut([
      runItem(alps.id, 'checked'),
      runItem(alps.id, 'unchecked'),
    ]);
    const page = await render();
    await page.settle(() =>
      expect(
        [...page.element.querySelectorAll('.runs .title')].map((a) =>
          a.textContent?.trim(),
        ),
      ).toEqual(['Groceries', 'Alps']),
    );
    expect(page.element.textContent).toContain('1 of 2 done');
    expect(page.element.textContent).toContain('No items yet');
    expect(page.element.textContent).not.toContain('Finished');
  });

  it('starts an empty ad-hoc run from New run and opens it', async () => {
    await withSpace();
    const page = await render();
    dialogAnswer = 'Groceries';
    await page.settle(() =>
      expect(page.element.querySelector('.fab')).not.toBeNull(),
    );
    (page.element.querySelector('.fab') as HTMLButtonElement).click();

    await page.settle(() => expect(requests).toHaveLength(1));
    expect(open.mock.calls[0][1]).toMatchObject({
      data: { heading: 'New run', confirm: 'Start' },
    });
    const [request] = requests;
    expect(request).toMatchObject({
      name: 'run.start',
      args: { title: 'Groceries', sourceListId: null, items: [] },
    });
    await page.settle(() =>
      expect(page.navigate).toHaveBeenCalledWith([
        '/runs',
        request.name === 'run.start' ? request.args.id : '',
      ]),
    );
  });

  it('starts nothing when New run is cancelled', async () => {
    await withSpace();
    const page = await render();
    await page.settle(() =>
      expect(page.element.querySelector('.fab')).not.toBeNull(),
    );
    (page.element.querySelector('.fab') as HTMLButtonElement).click();
    await page.fixture.whenStable();
    expect(requests).toEqual([]);
  });
});
