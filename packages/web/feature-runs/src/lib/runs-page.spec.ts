import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import {
  type List,
  type Run,
  type RunItem,
  newId,
} from '@lister/shared/domain';
import {
  makeList,
  makeLocalSpace,
  makeRun,
  makeRunItem,
} from '@lister/shared/testing';
import { LOCAL_DB, LocalDb } from '@lister/web/data-access-local-db';
import { type MutationRequest, SyncEngine } from '@lister/web/data-access-sync';
import { Notifier } from '@lister/web/util-notify';
import { of } from 'rxjs';
import { RunsPage } from './runs-page';

const SPACE = newId();
const run = (title: string, extra: Partial<Run> = {}): Run =>
  makeRun({ spaceId: SPACE, title, ...extra });
const runItem = (runId: string, state: RunItem['state']): RunItem =>
  makeRunItem({ spaceId: SPACE, runId, title: newId(), state });

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

const withSpace = () => db.spaces.put(makeLocalSpace({ id: SPACE }));

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

  it("shows the source list's colour and icon as they are now, and nothing for an ad-hoc run (D26)", async () => {
    await withSpace();
    const camping: List = makeList({
      spaceId: SPACE,
      title: 'Camping',
      colour: 'teal',
      icon: 'camping',
    });
    await db.lists.put(camping);
    await db.runs.bulkPut([
      run('Alps', { createdAt: 1, sourceListId: camping.id }),
      run('Groceries', { createdAt: 2 }),
    ]);
    const page = await render();
    await page.settle(() =>
      expect(page.element.querySelectorAll('lister-list-avatar')).toHaveLength(
        1,
      ),
    );
    const avatar = page.element.querySelector('lister-list-avatar');
    expect(avatar?.getAttribute('data-colour')).toBe('teal');
    expect(avatar?.textContent?.trim()).toBe('camping');

    await db.lists.put({ ...camping, colour: 'red', icon: null });
    await page.settle(() =>
      expect(
        page.element
          .querySelector('lister-list-avatar')
          ?.getAttribute('data-colour'),
      ).toBe('red'),
    );
  });

  it('shows no avatar for a run whose source list has neither colour nor icon', async () => {
    await withSpace();
    const camping: List = makeList({ spaceId: SPACE, title: 'Camping' });
    await db.lists.put(camping);
    await db.runs.put(run('Alps', { sourceListId: camping.id }));
    const page = await render();

    await page.settle(() =>
      expect(page.element.querySelector('.runs .title')?.textContent).toContain(
        'Alps',
      ),
    );
    expect(page.element.querySelector('lister-list-avatar')).toBeNull();
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
