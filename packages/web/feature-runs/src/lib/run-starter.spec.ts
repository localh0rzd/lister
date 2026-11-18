import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SpaceChanges } from '@lister/web/data-access-sync';
import {
  makeInclude,
  makeIncludeException,
  makeItem,
  makeList,
} from '@lister/shared/testing';
import { RunStarter } from './run-starter';

describe('RunStarter', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup() {
    const apply = vi.fn(async () => true);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SpaceChanges, useValue: { apply } },
      ],
    });
    const navigate = vi
      .spyOn(TestBed.inject(Router), 'navigate')
      .mockResolvedValue(true);
    return { starter: TestBed.inject(RunStarter), apply, navigate };
  }

  it('starts one run on a double tap', async () => {
    const { starter, apply, navigate } = setup();

    await Promise.all([starter.adHoc('Groceries'), starter.adHoc('Groceries')]);

    expect(apply).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('starts another run once the first one has started', async () => {
    const { starter, apply } = setup();

    await starter.adHoc('Groceries');
    await starter.adHoc('Hardware store');

    expect(apply).toHaveBeenCalledTimes(2);
  });

  it('can start again after a refused start', async () => {
    const { starter, apply, navigate } = setup();
    apply.mockResolvedValueOnce(false);

    await starter.adHoc('Groceries');
    await starter.adHoc('Groceries');

    expect(apply).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('leaves out what the list leaves out, direct and nested', async () => {
    const { starter, apply } = setup();
    const trip = makeList({ title: 'Trip' });
    const camping = makeList({ title: 'Camping' });
    const kitchen = makeList({ title: 'Kitchen' });
    const tent = makeItem({
      listId: camping.id,
      title: 'Tent',
      position: 'a0',
    });
    const stove = makeItem({
      listId: camping.id,
      title: 'Stove',
      position: 'a1',
    });
    const pan = makeItem({ listId: kitchen.id, title: 'Pan', position: 'a0' });
    const toCamping = makeInclude({
      parentListId: trip.id,
      childListId: camping.id,
      position: 'a0',
    });
    const toKitchen = makeInclude({
      parentListId: camping.id,
      childListId: kitchen.id,
      position: 'a2',
    });
    const left = [tent, pan].map((target) =>
      makeIncludeException({
        includeId: toCamping.id,
        targetKind: 'item',
        targetId: target.id,
      }),
    );
    const lists = [trip, camping, kitchen];
    const items = [tent, stove, pan];
    const includes = [toCamping, toKitchen];

    await starter.fromList(trip, {
      list: (id) => lists.find((row) => row.id === id),
      itemsOf: (id) => items.filter((row) => row.listId === id),
      includesOf: (id) => includes.filter((row) => row.parentListId === id),
      exceptionsOf: (id) => left.filter((row) => row.includeId === id),
    });

    const args = (
      apply.mock.calls as unknown as [
        { args: { items: { title: string }[] } },
      ][]
    )[0][0].args;
    expect(args.items.map((row) => row.title)).toEqual(['Stove']);
  });
});
