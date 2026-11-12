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
