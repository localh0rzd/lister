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
