import { newId } from '@lister/shared/domain';
import { MemoryRowStore, applyMutation } from './apply';
import { type Mutation, mutationSchema } from './mutations';

const SPACE = newId();
const USER = newId();

function apply(store: MemoryRowStore, name: string, args: object, version = 1) {
  const mutation = mutationSchema.parse({
    mutationId: newId(),
    spaceId: SPACE,
    name,
    args,
  }) as Mutation;
  return applyMutation(
    store,
    { spaceId: SPACE, userId: USER, now: 1000 * version, version },
    mutation,
  );
}

function moveToAnotherSpace(store: MemoryRowStore, listId: string) {
  const list = store.getList(listId);
  if (!list) throw new Error('no such list');
  store.putList({ ...list, spaceId: newId() });
}

function withList(deleted = false) {
  const store = new MemoryRowStore();
  const listId = newId();
  apply(store, 'list.create', { id: listId, title: 'Camping' });
  if (deleted) apply(store, 'list.delete', { id: listId }, 2);
  return { store, listId };
}

describe('applyMutation (shared by server and client)', () => {
  it('creates a list stamped with the context', () => {
    const store = new MemoryRowStore();
    const id = newId();

    expect(apply(store, 'list.create', { id, title: 'Camping' })).toEqual({
      kind: 'changed',
      lists: [id],
      items: [],
      includes: [],
      runs: [],
      runItems: [],
    });
    expect(store.getList(id)).toEqual({
      id,
      spaceId: SPACE,
      version: 1,
      deletedAt: null,
      createdBy: USER,
      updatedBy: USER,
      createdAt: 1000,
      updatedAt: 1000,
      title: 'Camping',
      description: '',
    });
  });

  it('creates a list with its items in order, as one change', () => {
    const store = new MemoryRowStore();
    const id = newId();
    const [tent, stove, lamp] = [newId(), newId(), newId()];

    const outcome = apply(store, 'list.create', {
      id,
      title: 'Camping',
      items: [
        { id: tent, title: 'Tent' },
        { id: stove, title: 'Stove' },
        { id: lamp, title: 'Lamp' },
      ],
    });

    expect(outcome).toEqual({
      kind: 'changed',
      lists: [id],
      items: [tent, stove, lamp],
      includes: [],
      runs: [],
      runItems: [],
    });
    const items = [tent, stove, lamp].map((i) => store.getItem(i));
    expect(items.map((i) => i?.title)).toEqual(['Tent', 'Stove', 'Lamp']);
    expect(items.every((i) => i?.listId === id && i.quantity === '')).toBe(
      true,
    );
    const positions = items.map((i) => i?.position ?? '');
    expect([...positions].sort()).toEqual(positions);
    expect(new Set(positions).size).toBe(3);
  });

  it('writes nothing when one of the new item ids is taken', () => {
    const { store, listId } = withList();
    const taken = newId();
    apply(store, 'item.create', {
      id: taken,
      listId,
      title: 'Tent',
      position: 'a0',
    });
    const id = newId();

    expect(
      apply(store, 'list.create', {
        id,
        title: 'Other',
        items: [
          { id: newId(), title: 'Stove' },
          { id: taken, title: 'Lamp' },
        ],
      }),
    ).toEqual({ kind: 'rejected', reason: 'This item already exists' });
    expect(store.getList(id)).toBeUndefined();
    expect(store.items.size).toBe(1);
  });

  it('ignores a retried list.create with items', () => {
    const store = new MemoryRowStore();
    const args = {
      id: newId(),
      title: 'Camping',
      items: [{ id: newId(), title: 'Tent' }],
    };
    apply(store, 'list.create', args);

    expect(apply(store, 'list.create', args, 2)).toEqual({ kind: 'unchanged' });
    expect(store.items.size).toBe(1);
  });

  it('patches only the given fields', () => {
    const { store, listId } = withList();

    apply(
      store,
      'list.update',
      { id: listId, patch: { description: 'Summer' } },
      2,
    );

    expect(store.getList(listId)).toMatchObject({
      title: 'Camping',
      description: 'Summer',
      version: 2,
      createdAt: 1000,
      updatedAt: 2000,
    });
  });

  it('ignores changes to a deleted list and to its items; restores bring it back', () => {
    const { store, listId } = withList();
    const itemId = newId();
    apply(
      store,
      'item.create',
      { id: itemId, listId, title: 'Tent', position: 'a0' },
      2,
    );
    apply(store, 'list.delete', { id: listId }, 3);

    for (const [name, args] of [
      ['list.update', { id: listId, patch: { title: 'x' } }],
      ['item.update', { id: itemId, patch: { title: 'x' } }],
      ['item.move', { id: itemId, position: 'a5' }],
      ['item.delete', { id: itemId }],
      ['item.create', { id: newId(), listId, title: 'x', position: 'a1' }],
    ] as const) {
      expect(apply(store, name, args, 4), name).toEqual({ kind: 'unchanged' });
    }
    expect(store.items.size).toBe(1);

    expect(apply(store, 'list.restore', { id: listId }, 5)).toMatchObject({
      kind: 'changed',
    });
    expect(
      apply(
        store,
        'item.update',
        { id: itemId, patch: { title: 'Big tent' } },
        6,
      ),
    ).toMatchObject({
      kind: 'changed',
    });
  });

  it('is idempotent for creates in the same space, rejects ids of another space', () => {
    const { store, listId } = withList();

    expect(
      apply(store, 'list.create', { id: listId, title: 'Again' }, 2),
    ).toEqual({
      kind: 'unchanged',
    });
    moveToAnotherSpace(store, listId);
    expect(
      apply(store, 'list.create', { id: listId, title: 'Again' }, 3),
    ).toEqual({
      kind: 'rejected',
      reason: 'This list already exists',
    });
  });

  it.each([
    ['list.update', { patch: { title: 'x' } }, "This list doesn't exist"],
    ['list.delete', {}, "This list doesn't exist"],
    ['item.update', { patch: { title: 'x' } }, "This item doesn't exist"],
    ['item.restore', {}, "This item doesn't exist"],
  ] as const)(
    'rejects %s of a missing row without writing',
    (name, extra, reason) => {
      const { store } = withList();
      const before = [...store.lists.values()];

      expect(apply(store, name, { id: newId(), ...extra }, 2)).toEqual({
        kind: 'rejected',
        reason,
      });
      expect([...store.lists.values()]).toEqual(before);
    },
  );

  it('does not reach rows of another space', () => {
    const { store, listId } = withList();
    moveToAnotherSpace(store, listId);

    expect(
      apply(store, 'list.update', { id: listId, patch: { title: 'x' } }, 2),
    ).toEqual({
      kind: 'rejected',
      reason: "This list doesn't exist",
    });
  });

  it('acks restoring a live row and deleting a deleted one without a change', () => {
    const { store, listId } = withList(true);

    expect(apply(store, 'list.delete', { id: listId }, 3)).toEqual({
      kind: 'unchanged',
    });
    apply(store, 'list.restore', { id: listId }, 4);
    expect(apply(store, 'list.restore', { id: listId }, 5)).toEqual({
      kind: 'unchanged',
    });
  });
});

describe('includes', () => {
  /** A space with lists of these titles; returns their ids by title. */
  function lists<T extends string>(...titles: T[]) {
    const store = new MemoryRowStore();
    const ids = {} as Record<T, string>;
    for (const title of titles) {
      ids[title] = newId();
      apply(store, 'list.create', { id: ids[title], title });
    }
    return { store, ids };
  }
  const include = (
    store: MemoryRowStore,
    parentListId: string,
    childListId: string,
    version = 2,
    id = newId(),
  ) => ({
    id,
    outcome: apply(
      store,
      'include.create',
      { id, parentListId, childListId, position: 'a0' },
      version,
    ),
  });

  it('includes one list in another, stamped like other rows', () => {
    const { store, ids } = lists('Trip', 'Camping');
    const { id, outcome } = include(store, ids.Trip, ids.Camping);

    expect(outcome).toEqual({
      kind: 'changed',
      lists: [],
      items: [],
      includes: [id],
      runs: [],
      runItems: [],
    });
    expect(store.getInclude(id)).toMatchObject({
      parentListId: ids.Trip,
      childListId: ids.Camping,
      position: 'a0',
      spaceId: SPACE,
      version: 2,
      deletedAt: null,
      createdBy: USER,
    });
  });

  it('refuses a list including itself, a list twice, and loops of any length', () => {
    const { store, ids } = lists('A', 'B', 'C');
    expect(include(store, ids.A, ids.A).outcome).toEqual({
      kind: 'rejected',
      reason: "A list can't include itself",
    });
    include(store, ids.A, ids.B);
    expect(include(store, ids.A, ids.B, 3).outcome).toEqual({
      kind: 'rejected',
      reason: '“B” is already included',
    });
    expect(include(store, ids.B, ids.A, 3).outcome).toEqual({
      kind: 'rejected',
      reason: 'That would make a loop: “A” already contains “B”',
    });
    include(store, ids.B, ids.C, 3);
    expect(include(store, ids.C, ids.A, 4).outcome).toMatchObject({
      kind: 'rejected',
    });
    expect(store.includes.size).toBe(2);
  });

  it('allows a diamond', () => {
    const { store, ids } = lists('Trip', 'Hostel', 'Camping', 'Toiletries');
    include(store, ids.Trip, ids.Hostel);
    include(store, ids.Trip, ids.Camping);
    include(store, ids.Hostel, ids.Toiletries);
    expect(include(store, ids.Camping, ids.Toiletries).outcome).toMatchObject({
      kind: 'changed',
    });
  });

  it('is idempotent by id, and rejects an id from another space', () => {
    const { store, ids } = lists('A', 'B');
    const { id } = include(store, ids.A, ids.B);
    expect(include(store, ids.A, ids.B, 3, id).outcome).toEqual({
      kind: 'unchanged',
    });
    const row = store.getInclude(id);
    if (!row) throw new Error('missing');
    store.putInclude({ ...row, spaceId: newId() });
    expect(include(store, ids.A, ids.B, 4, id).outcome).toEqual({
      kind: 'rejected',
      reason: 'This include already exists',
    });
  });

  it('refuses lists that are missing or in another space', () => {
    const { store, ids } = lists('A', 'B');
    expect(include(store, ids.A, newId()).outcome).toEqual({
      kind: 'rejected',
      reason: "This list doesn't exist",
    });
    moveToAnotherSpace(store, ids.B);
    expect(include(store, ids.A, ids.B).outcome).toMatchObject({
      kind: 'rejected',
    });
  });

  it('may include a list in the trash; a deleted parent wins', () => {
    const { store, ids } = lists('A', 'B', 'C');
    apply(store, 'list.delete', { id: ids.B }, 2);
    expect(include(store, ids.A, ids.B, 3).outcome).toMatchObject({
      kind: 'changed',
    });
    apply(store, 'list.delete', { id: ids.A }, 4);
    expect(include(store, ids.A, ids.C, 5).outcome).toEqual({
      kind: 'unchanged',
    });
  });

  it('moves, removes and restores an include; delete wins over a move', () => {
    const { store, ids } = lists('A', 'B');
    const { id } = include(store, ids.A, ids.B);

    apply(store, 'include.move', { id, position: 'a5' }, 3);
    expect(store.getInclude(id)).toMatchObject({ position: 'a5', version: 3 });
    apply(store, 'include.delete', { id }, 4);
    expect(store.getInclude(id)).toMatchObject({ deletedAt: 4000 });
    expect(apply(store, 'include.move', { id, position: 'a1' }, 5)).toEqual({
      kind: 'unchanged',
    });
    // Once removed, the list may be included again, and the loop check ignores it.
    expect(include(store, ids.B, ids.A, 6).outcome).toMatchObject({
      kind: 'changed',
    });
  });

  it('refuses restoring an include that would now make a loop or a duplicate', () => {
    const { store, ids } = lists('A', 'B');
    const { id } = include(store, ids.A, ids.B);
    apply(store, 'include.delete', { id }, 3);
    include(store, ids.B, ids.A, 4);

    expect(apply(store, 'include.restore', { id }, 5)).toEqual({
      kind: 'rejected',
      reason: 'That would make a loop: “B” already contains “A”',
    });

    const again = lists('A', 'B');
    const first = include(again.store, again.ids.A, again.ids.B);
    apply(again.store, 'include.delete', { id: first.id }, 3);
    include(again.store, again.ids.A, again.ids.B, 4);
    expect(apply(again.store, 'include.restore', { id: first.id }, 5)).toEqual({
      kind: 'rejected',
      reason: '“B” is already included',
    });
  });

  it('restores a removed include', () => {
    const { store, ids } = lists('A', 'B');
    const { id } = include(store, ids.A, ids.B);
    apply(store, 'include.delete', { id }, 3);
    expect(apply(store, 'include.restore', { id }, 4)).toMatchObject({
      kind: 'changed',
    });
    expect(store.getInclude(id)).toMatchObject({ deletedAt: null });
  });

  it("rejects changes to an include that doesn't exist", () => {
    const { store } = lists();
    for (const name of ['include.move', 'include.delete', 'include.restore']) {
      const args =
        name === 'include.move'
          ? { id: newId(), position: 'a0' }
          : { id: newId() };
      expect(apply(store, name, args), name).toEqual({
        kind: 'rejected',
        reason: "This list isn't included there",
      });
    }
  });
});

describe('list.duplicate', () => {
  function source() {
    const store = new MemoryRowStore();
    const listId = newId();
    const childId = newId();
    apply(store, 'list.create', {
      id: listId,
      title: 'Camping',
      description: 'Summer',
    });
    apply(store, 'list.create', { id: childId, title: 'Toiletries' });
    const tent = newId();
    const stove = newId();
    const gone = newId();
    apply(store, 'item.create', {
      id: tent,
      listId,
      title: 'Tent',
      quantity: '1',
      note: 'big',
      position: 'a1',
    });
    apply(store, 'item.create', {
      id: stove,
      listId,
      title: 'Stove',
      position: 'a0',
    });
    apply(store, 'item.create', {
      id: gone,
      listId,
      title: 'Gone',
      position: 'a2',
    });
    apply(store, 'item.delete', { id: gone }, 2);
    const include = newId();
    apply(store, 'include.create', {
      id: include,
      parentListId: listId,
      childListId: childId,
      position: 'a5',
    });
    return { store, listId, childId, tent, stove, gone, include };
  }

  it('copies the list, its items and its includes in one change', () => {
    const s = source();
    const copy = newId();
    const [tentCopy, stoveCopy, includeCopy] = [newId(), newId(), newId()];

    const outcome = apply(
      s.store,
      'list.duplicate',
      {
        id: copy,
        sourceListId: s.listId,
        title: 'Copy of Camping',
        items: [
          { from: s.stove, id: stoveCopy },
          { from: s.tent, id: tentCopy },
          { from: s.gone, id: newId() }, // deleted meanwhile: skipped
        ],
        includes: [{ from: s.include, id: includeCopy }],
      },
      5,
    );

    expect(outcome).toEqual({
      kind: 'changed',
      lists: [copy],
      items: [stoveCopy, tentCopy],
      includes: [includeCopy],
      runs: [],
      runItems: [],
    });
    expect(s.store.getList(copy)).toMatchObject({
      title: 'Copy of Camping',
      description: 'Summer',
      version: 5,
      deletedAt: null,
    });
    expect(s.store.getItem(tentCopy)).toMatchObject({
      listId: copy,
      title: 'Tent',
      quantity: '1',
      note: 'big',
      position: 'a1',
      version: 5,
      createdAt: 5000,
    });
    expect(s.store.getInclude(includeCopy)).toMatchObject({
      parentListId: copy,
      childListId: s.childId,
      position: 'a5',
    });
    // The source is untouched.
    expect(s.store.getItem(s.tent)).toMatchObject({
      listId: s.listId,
      version: 1,
    });
  });

  it('is idempotent by id and writes nothing when an id is taken', () => {
    const s = source();
    const copy = newId();
    const args = {
      id: copy,
      sourceListId: s.listId,
      title: 'Copy',
      items: [{ from: s.tent, id: newId() }],
      includes: [],
    };
    apply(s.store, 'list.duplicate', args, 5);
    expect(apply(s.store, 'list.duplicate', args, 6)).toEqual({
      kind: 'unchanged',
    });

    const before = s.store.lists.size;
    expect(
      apply(
        s.store,
        'list.duplicate',
        { ...args, id: newId(), items: [{ from: s.tent, id: s.stove }] },
        7,
      ),
    ).toEqual({ kind: 'rejected', reason: 'This item already exists' });
    expect(s.store.lists.size).toBe(before);
  });

  it('refuses a source that is missing or in another space', () => {
    const s = source();
    const args = (sourceListId: string) => ({
      id: newId(),
      sourceListId,
      title: 'Copy',
      items: [],
      includes: [],
    });
    expect(apply(s.store, 'list.duplicate', args(newId()), 5)).toEqual({
      kind: 'rejected',
      reason: "This list doesn't exist",
    });
    moveToAnotherSpace(s.store, s.listId);
    expect(apply(s.store, 'list.duplicate', args(s.listId), 5)).toMatchObject({
      kind: 'rejected',
    });
  });

  it('only copies rows that belong to the source', () => {
    const s = source();
    const copy = newId();
    const outcome = apply(
      s.store,
      'list.duplicate',
      {
        id: copy,
        sourceListId: s.childId,
        title: 'Copy',
        items: [{ from: s.tent, id: newId() }],
        includes: [{ from: s.include, id: newId() }],
      },
      5,
    );
    expect(outcome).toEqual({
      kind: 'changed',
      lists: [copy],
      items: [],
      includes: [],
      runs: [],
      runItems: [],
    });
  });
});

describe('runs', () => {
  const basic = newId();
  const camping = newId();
  const entry = (
    title: string,
    extra: { quantity?: string; note?: string; sources?: string[] } = {},
  ) => ({ id: newId(), title, ...extra });

  /** The live (not merged-away or removed) items. */
  const live = (store: MemoryRowStore) =>
    [...store.runItems.values()].filter((item) => item.deletedAt === null);

  function start(items: ReturnType<typeof entry>[], version = 1) {
    const store = new MemoryRowStore();
    apply(store, 'list.create', { id: basic, title: 'Basic' });
    apply(store, 'list.create', { id: camping, title: 'Camping' });
    const runId = newId();
    const outcome = apply(
      store,
      'run.start',
      { id: runId, title: 'Alps', sourceListId: basic, items },
      version,
    );
    const titles = () =>
      [...store.runItems.values()]
        .filter((item) => item.deletedAt === null)
        .sort((a, b) => (a.position < b.position ? -1 : 1))
        .map((item) => `${item.title}×${item.quantity || 1}`);
    return { store, runId, outcome, titles };
  }

  it('starts a run with its items in order, unchecked', () => {
    const tent = entry('Tent', { sources: [camping] });
    const map = entry('Map', { sources: [basic] });
    const run = start([tent, map]);

    expect(run.outcome).toEqual(
      expect.objectContaining({
        runs: [run.runId],
        runItems: [tent.id, map.id],
      }),
    );
    expect(run.store.getRun(run.runId)).toMatchObject({
      title: 'Alps',
      sourceListId: basic,
      finishedAt: null,
      createdBy: USER,
    });
    expect(run.store.getRunItem(tent.id)).toMatchObject({
      runId: run.runId,
      state: 'unchecked',
      sources: [camping],
      stateBy: null,
    });
    expect(run.titles()).toEqual(['Tent×1', 'Map×1']);
  });

  it('starts an empty ad-hoc run', () => {
    const store = new MemoryRowStore();
    const id = newId();
    apply(store, 'run.start', { id, title: 'Groceries' });
    expect(store.getRun(id)).toMatchObject({
      sourceListId: null,
      finishedAt: null,
    });
  });

  it('merges identical items as they enter (D16): larger quantity, joined notes, every source', () => {
    const run = start([
      entry('Headlamp', { sources: [basic] }),
      entry(' headlamp ', {
        quantity: '2',
        note: 'spare batteries',
        sources: [camping],
      }),
      entry('Socks', { quantity: '2 pairs', sources: [basic] }),
      entry('SOCKS', { quantity: '1 pair', sources: [camping] }),
    ]);

    const items = live(run.store);
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.title === 'Headlamp')).toMatchObject({
      quantity: '2',
      note: 'spare batteries',
      sources: [basic, camping],
    });
    expect(items.find((i) => i.title === 'Socks')).toMatchObject({
      quantity: '2 pairs, 1 pair',
    });
  });

  it('merges a typed-in item and a whole added list into existing items, appending the rest', () => {
    const run = start([entry('Tent', { sources: [camping] })]);
    const milk = entry('Milk');
    apply(
      run.store,
      'run.addItems',
      { runId: run.runId, items: [entry('tent'), milk] },
      2,
    );
    const toiletries = newId();
    apply(
      run.store,
      'run.addItems',
      {
        runId: run.runId,
        items: [
          entry('Soap', { sources: [toiletries] }),
          entry('Milk', { quantity: '2', sources: [toiletries] }),
        ],
      },
      3,
    );

    expect(run.titles()).toEqual(['Tent×1', 'Milk×2', 'Soap×1']);
    expect(run.store.getRunItem(milk.id)).toMatchObject({
      sources: [toiletries],
    });
  });

  it('unchecks a checked item when a merge raises its quantity, and reopens the run', () => {
    const tent = entry('Tent', { sources: [camping] });
    const run = start([tent]);
    apply(run.store, 'runItem.setState', { id: tent.id, state: 'checked' }, 2);
    expect(run.store.getRun(run.runId)?.finishedAt).toBe(2000);

    const more = entry('Tent', { quantity: '2', sources: [basic] });
    const outcome = apply(
      run.store,
      'run.addItems',
      { runId: run.runId, items: [more] },
      3,
    );

    // Unchecked by the merge: a change of state by whoever added the item.
    expect(run.store.getRunItem(tent.id)).toMatchObject({
      state: 'unchecked',
      quantity: '2',
      stateBy: USER,
      stateAt: 3000,
    });
    expect(run.store.getRun(run.runId)?.finishedAt).toBeNull();
    // The target and the merged-away id (an alias) are written.
    expect(outcome).toEqual(
      expect.objectContaining({
        runs: [run.runId],
        runItems: [tent.id, more.id],
      }),
    );
  });

  it('finishes while every item is checked or skipped, and reopens on uncheck or a new item', () => {
    const [a, b] = [entry('A'), entry('B')];
    const run = start([a, b]);
    const finishedAt = () => run.store.getRun(run.runId)?.finishedAt;

    apply(run.store, 'runItem.setState', { id: a.id, state: 'checked' }, 2);
    expect(finishedAt()).toBeNull();
    const last = apply(
      run.store,
      'runItem.setState',
      { id: b.id, state: 'skipped' },
      3,
    );
    expect(finishedAt()).toBe(3000);
    expect(last).toEqual(
      expect.objectContaining({ runs: [run.runId], runItems: [b.id] }),
    );
    expect(run.store.getRunItem(b.id)).toMatchObject({
      stateBy: USER,
      stateAt: 3000,
    });

    apply(run.store, 'runItem.setState', { id: a.id, state: 'unchecked' }, 4);
    expect(finishedAt()).toBeNull();
    apply(run.store, 'runItem.setState', { id: a.id, state: 'checked' }, 5);
    expect(finishedAt()).toBe(5000);
    apply(
      run.store,
      'run.addItems',
      { runId: run.runId, items: [entry('C')] },
      6,
    );
    expect(finishedAt()).toBeNull();
    // Removing the only unchecked item finishes it again.
    const c = live(run.store).find((i) => i.title === 'C');
    apply(run.store, 'runItem.remove', { id: c?.id }, 7);
    expect(finishedAt()).toBe(7000);
  });

  it('sets, never toggles: setting the same state again changes nothing', () => {
    const a = entry('A');
    const run = start([a, entry('B')]);
    apply(run.store, 'runItem.setState', { id: a.id, state: 'checked' }, 2);
    expect(
      apply(run.store, 'runItem.setState', { id: a.id, state: 'checked' }, 3),
    ).toEqual({
      kind: 'unchanged',
    });
    expect(run.store.getRunItem(a.id)).toMatchObject({
      state: 'checked',
      version: 2,
    });
  });

  it('edits, moves, removes and restores items; a removed item wins over later changes', () => {
    const a = entry('A');
    const run = start([a, entry('B')]);
    apply(
      run.store,
      'runItem.update',
      { id: a.id, patch: { quantity: '3', note: 'big' } },
      2,
    );
    apply(run.store, 'runItem.move', { id: a.id, position: 'a5' }, 3);
    expect(run.titles()).toEqual(['B×1', 'A×3']);
    apply(run.store, 'runItem.remove', { id: a.id }, 4);
    expect(
      apply(run.store, 'runItem.setState', { id: a.id, state: 'checked' }, 5),
    ).toEqual({
      kind: 'unchanged',
    });
    apply(run.store, 'runItem.restore', { id: a.id }, 6);
    expect(run.store.getRunItem(a.id)).toMatchObject({
      deletedAt: null,
      state: 'unchecked',
    });
  });

  it('renames a run', () => {
    const run = start([]);
    apply(
      run.store,
      'run.update',
      { id: run.runId, patch: { title: 'Alps 2027' } },
      2,
    );
    expect(run.store.getRun(run.runId)).toMatchObject({
      title: 'Alps 2027',
      version: 2,
    });
  });

  it('is idempotent by run id and rejects unknown runs and items', () => {
    const tent = entry('Tent');
    const run = start([tent]);
    expect(
      apply(
        run.store,
        'run.start',
        { id: run.runId, title: 'Again', items: [entry('X')] },
        2,
      ),
    ).toEqual({ kind: 'unchanged' });
    expect(
      apply(run.store, 'run.addItems', { runId: newId(), items: [entry('X')] }),
    ).toEqual({
      kind: 'rejected',
      reason: "This run doesn't exist",
    });
    expect(
      apply(run.store, 'runItem.setState', { id: newId(), state: 'checked' }),
    ).toEqual({
      kind: 'rejected',
      reason: "This item isn't in the run",
    });
    // Another run already has this item id.
    expect(
      apply(
        run.store,
        'run.start',
        { id: newId(), title: 'B', items: [{ ...tent }] },
        3,
      ),
    ).toEqual({ kind: 'rejected', reason: 'This item already exists' });
  });

  it("doesn't touch the lists it was started from", () => {
    const store = new MemoryRowStore();
    const listId = newId();
    apply(store, 'list.create', { id: listId, title: 'Camping' });
    const itemId = newId();
    apply(store, 'item.create', {
      id: itemId,
      listId,
      title: 'Tent',
      position: 'a0',
    });
    const runId = newId();
    apply(
      store,
      'run.start',
      {
        id: runId,
        title: 'Alps',
        sourceListId: listId,
        items: [{ id: newId(), title: 'Tent', sources: [listId] }],
      },
      2,
    );
    apply(
      store,
      'item.update',
      { id: itemId, patch: { title: 'Big tent' } },
      3,
    );

    expect([...store.runItems.values()].map((i) => i.title)).toEqual(['Tent']);
  });

  it('applies changes to a merged-away id to the item it merged into (offline check)', () => {
    // Ben added Milk while Ann, offline, added Milk too and checked it.
    const run = start([]);
    const bens = entry('Milk');
    apply(run.store, 'run.addItems', { runId: run.runId, items: [bens] }, 2);
    const anns = entry('milk');
    apply(run.store, 'run.addItems', { runId: run.runId, items: [anns] }, 3);

    expect(run.store.getRunItem(anns.id)).toMatchObject({
      mergedInto: bens.id,
      deletedAt: 3000,
    });
    const outcome = apply(
      run.store,
      'runItem.setState',
      { id: anns.id, state: 'checked' },
      4,
    );

    expect(outcome).toEqual(
      expect.objectContaining({ runItems: [bens.id], runs: [run.runId] }),
    );
    expect(run.store.getRunItem(bens.id)).toMatchObject({ state: 'checked' });
    expect(run.store.getRun(run.runId)?.finishedAt).toBe(4000);
    expect(live(run.store)).toHaveLength(1);
  });

  it('writes nothing when merged items bring nothing new', () => {
    const tent = entry('Tent', { sources: [camping] });
    const run = start([tent]);
    const again = entry('Tent', { sources: [camping] });
    const outcome = apply(
      run.store,
      'run.addItems',
      { runId: run.runId, items: [again] },
      2,
    );

    // Only the alias of the new id is written; the item keeps its version.
    expect(outcome).toEqual(
      expect.objectContaining({ runItems: [again.id], runs: [] }),
    );
    expect(run.store.getRunItem(tent.id)).toMatchObject({ version: 1 });
    // Sending the same items again (a replay) is no change at all.
    expect(
      apply(run.store, 'run.addItems', { runId: run.runId, items: [again] }, 3),
    ).toEqual({ kind: 'unchanged' });
  });

  it('restoring an item merges it into an identical one that entered meanwhile', () => {
    const tent = entry('Tent');
    const run = start([tent]);
    apply(run.store, 'runItem.remove', { id: tent.id }, 2);
    const newTent = entry('Tent', { quantity: '2', sources: [camping] });
    apply(run.store, 'run.addItems', { runId: run.runId, items: [newTent] }, 3);

    apply(run.store, 'runItem.restore', { id: tent.id }, 4);

    expect(live(run.store).map((i) => i.title)).toEqual(['Tent']);
    expect(run.store.getRunItem(tent.id)).toMatchObject({
      mergedInto: newTent.id,
    });
  });

  it('refuses a source list that does not exist or is in another space', () => {
    const run = start([]);
    expect(
      apply(run.store, 'run.start', {
        id: newId(),
        title: 'X',
        sourceListId: newId(),
      }),
    ).toEqual({ kind: 'rejected', reason: "This list doesn't exist" });
    moveToAnotherSpace(run.store, camping);
    expect(
      apply(run.store, 'run.start', {
        id: newId(),
        title: 'X',
        sourceListId: camping,
      }),
    ).toMatchObject({ kind: 'rejected' });
    // A list in the trash is fine.
    apply(run.store, 'list.delete', { id: basic }, 2);
    expect(
      apply(
        run.store,
        'run.start',
        { id: newId(), title: 'X', sourceListId: basic },
        3,
      ),
    ).toMatchObject({ kind: 'changed' });
  });

  it('stays inside its space', () => {
    const milk = entry('Milk');
    const run = start([milk]);
    const theirs = run.store.getRun(run.runId);
    const theirItem = run.store.getRunItem(milk.id);
    if (!theirs || !theirItem) throw new Error('not started');
    const otherSpace = newId();
    run.store.putRun({ ...theirs, spaceId: otherSpace });
    run.store.putRunItem({ ...theirItem, spaceId: otherSpace });

    expect(
      apply(run.store, 'run.update', { id: run.runId, patch: { title: 'X' } }),
    ).toEqual({ kind: 'rejected', reason: "This run doesn't exist" });
    expect(
      apply(run.store, 'run.addItems', {
        runId: run.runId,
        items: [entry('X')],
      }),
    ).toMatchObject({ kind: 'rejected' });
    for (const [name, args] of [
      ['runItem.setState', { id: milk.id, state: 'checked' }],
      ['runItem.update', { id: milk.id, patch: { note: 'x' } }],
      ['runItem.move', { id: milk.id, position: 'a9' }],
      ['runItem.remove', { id: milk.id }],
      ['runItem.restore', { id: milk.id }],
    ] as const) {
      expect(apply(run.store, name, args), name).toMatchObject({
        kind: 'rejected',
      });
    }
    // An item id taken in another space can't enter a run here.
    expect(
      apply(run.store, 'run.start', {
        id: newId(),
        title: 'Mine',
        items: [{ ...milk }],
      }),
    ).toEqual({ kind: 'rejected', reason: 'This item already exists' });

    // Items of another space with this run's id are neither merged into nor counted.
    const runHere = newId();
    const bread = entry('Bread');
    apply(
      run.store,
      'run.start',
      { id: runHere, title: 'Here', items: [bread] },
      2,
    );
    run.store.putRunItem({
      ...theirItem,
      spaceId: otherSpace,
      id: newId(),
      runId: runHere,
      title: 'Bread',
      state: 'unchecked',
    });
    apply(run.store, 'runItem.setState', { id: bread.id, state: 'checked' }, 3);
    expect(run.store.getRun(runHere)?.finishedAt).toBe(3000);
    const breadAgain = entry('bread', { quantity: '5' });
    apply(
      run.store,
      'run.addItems',
      { runId: runHere, items: [breadAgain] },
      4,
    );
    expect(run.store.getRunItem(breadAgain.id)).toMatchObject({
      mergedInto: bread.id,
    });
  });
});

describe('run.saveAsList', () => {
  function runWith() {
    const store = new MemoryRowStore();
    const runId = newId();
    const [tent, milk, soap, gone] = [newId(), newId(), newId(), newId()];
    const entry = (id: string, title: string, extra = {}) => ({
      id,
      title,
      quantity: '',
      note: '',
      sources: [],
      ...extra,
    });
    apply(store, 'run.start', {
      id: runId,
      title: 'Alps',
      sourceListId: null,
      items: [
        entry(tent, 'Tent', { quantity: '2', note: 'big' }),
        entry(milk, 'Milk'),
        entry(soap, 'Soap'),
        entry(gone, 'Gone'),
      ],
    });
    apply(store, 'runItem.setState', { id: milk, state: 'checked' }, 2);
    apply(store, 'runItem.setState', { id: soap, state: 'skipped' }, 2);
    apply(store, 'runItem.remove', { id: gone }, 2);
    return { store, runId, tent, milk, soap, gone };
  }
  const copies = (s: { store: MemoryRowStore }, listId: string) =>
    [...s.store.items.values()]
      .filter((item) => item.listId === listId)
      .sort((a, b) => (a.position < b.position ? -1 : 1));

  it('creates a list with copies of the live run items in the given order, leaving the run as it is', () => {
    const s = runWith();
    const before = JSON.stringify([...s.store.runItems.values()]);
    const listId = newId();
    const ids = [newId(), newId(), newId(), newId()];

    const outcome = apply(
      s.store,
      'run.saveAsList',
      {
        runId: s.runId,
        listId,
        title: 'Alps gear',
        items: [
          { from: s.soap, id: ids[0] },
          { from: s.tent, id: ids[1] },
          { from: s.gone, id: ids[2] },
          { from: s.milk, id: ids[3] },
        ],
      },
      3,
    );

    expect(outcome).toEqual({
      kind: 'changed',
      lists: [listId],
      items: [ids[0], ids[1], ids[3]],
      includes: [],
      runs: [],
      runItems: [],
    });
    expect(s.store.getList(listId)).toMatchObject({
      title: 'Alps gear',
      description: '',
      spaceId: SPACE,
      version: 3,
    });
    expect(
      copies(s, listId).map(({ id, title, quantity, note }) => ({
        id,
        title,
        quantity,
        note,
      })),
    ).toEqual([
      { id: ids[0], title: 'Soap', quantity: '', note: '' },
      { id: ids[1], title: 'Tent', quantity: '2', note: 'big' },
      { id: ids[3], title: 'Milk', quantity: '', note: '' },
    ]);
    expect(JSON.stringify([...s.store.runItems.values()])).toBe(before);
  });

  it('is harmless when retried', () => {
    const s = runWith();
    const args = {
      runId: s.runId,
      listId: newId(),
      title: 'Alps gear',
      items: [{ from: s.tent, id: newId() }],
    };
    apply(s.store, 'run.saveAsList', args, 3);

    expect(apply(s.store, 'run.saveAsList', args, 4)).toEqual({
      kind: 'unchanged',
    });
    expect(copies(s, args.listId)).toHaveLength(1);
  });

  it('refuses an unknown, foreign or deleted run and writes nothing', () => {
    const s = runWith();
    const tryWith = (runId: string) =>
      apply(s.store, 'run.saveAsList', {
        runId,
        listId: newId(),
        title: 'X',
        items: [{ from: s.tent, id: newId() }],
      });
    const lists = s.store.lists.size;

    expect(tryWith(newId())).toEqual({
      kind: 'rejected',
      reason: "This run doesn't exist",
    });
    const run = s.store.getRun(s.runId);
    if (!run) throw new Error('no run');
    s.store.putRun({ ...run, deletedAt: 5 });
    expect(tryWith(s.runId)).toMatchObject({ kind: 'rejected' });
    s.store.putRun({ ...run, spaceId: newId() });
    expect(tryWith(s.runId)).toMatchObject({ kind: 'rejected' });
    expect(s.store.lists.size).toBe(lists);
    expect(s.store.items.size).toBe(0);
  });

  it('copies an item merged away since the client looked as the item it became, once', () => {
    const s = runWith();
    // Milk added again (offline, say) merges into the run's Milk (D16): its id is an alias.
    const alias = newId();
    apply(
      s.store,
      'run.addItems',
      {
        runId: s.runId,
        items: [
          { id: alias, title: 'milk', quantity: '', note: '', sources: [] },
        ],
      },
      3,
    );
    expect(s.store.getRunItem(alias)?.mergedInto).toBe(s.milk);
    const save = (from: string[]) => {
      const listId = newId();
      apply(s.store, 'run.saveAsList', {
        runId: s.runId,
        listId,
        title: 'Gear',
        items: from.map((id) => ({ from: id, id: newId() })),
      });
      return copies(s, listId).map((item) => item.title);
    };

    expect(save([s.tent, alias])).toEqual(['Tent', 'Milk']);
    expect(save([alias, s.milk, s.tent])).toEqual(['Milk', 'Tent']);
  });

  it('refuses an item id that already exists', () => {
    const s = runWith();
    const first = {
      runId: s.runId,
      listId: newId(),
      title: 'A',
      items: [{ from: s.tent, id: newId() }],
    };
    apply(s.store, 'run.saveAsList', first);

    expect(
      apply(s.store, 'run.saveAsList', { ...first, listId: newId() }),
    ).toEqual({ kind: 'rejected', reason: 'This item already exists' });

    const twice = newId();
    const lists = s.store.lists.size;
    expect(
      apply(s.store, 'run.saveAsList', {
        runId: s.runId,
        listId: newId(),
        title: 'B',
        items: [
          { from: s.tent, id: twice },
          { from: s.milk, id: twice },
        ],
      }),
    ).toEqual({ kind: 'rejected', reason: 'This item already exists' });
    expect(s.store.lists.size).toBe(lists);
  });
});
