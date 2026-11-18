import { eq } from 'drizzle-orm';
import {
  type DatabaseConnection,
  createTestDatabase,
  schema,
} from '@lister/api/data-access-db';
import { newId } from '@lister/shared/domain';
import { makeList } from '@lister/shared/testing';
import type { MutationInput } from '@lister/shared/sync-protocol';
import { MutationService } from './mutation.service';

const SPACE = newId();
const OTHER_SPACE = newId();
const ALICE = newId();
const BEN = newId();

let database: DatabaseConnection;
let service: MutationService;
let now: number;

beforeEach(() => {
  database = createTestDatabase();
  for (const [id, username] of [
    [ALICE, 'alice'],
    [BEN, 'ben'],
  ]) {
    database.db
      .insert(schema.users)
      .values({
        id,
        username,
        displayName: username,
        passwordHash: 'x',
        createdAt: 0,
      })
      .run();
  }
  for (const id of [SPACE, OTHER_SPACE]) {
    database.db
      .insert(schema.spaces)
      .values({ id, name: 'Space', version: 0, createdAt: 0 })
      .run();
    // Alice owns both; Ben belongs to neither.
    database.db
      .insert(schema.memberships)
      .values({ spaceId: id, userId: ALICE, role: 'owner', createdAt: 0 })
      .run();
  }
  now = 1_700_000_000_000;
  service = new MutationService(database, () => now);
});
afterEach(() => database.onApplicationShutdown());

/** Pushes one mutation as ALICE. */
function push(
  name: MutationInput['name'],
  args: Record<string, unknown>,
  options: { spaceId?: string; mutationId?: string } = {},
) {
  return service.apply(
    {
      mutationId: options.mutationId ?? newId(),
      spaceId: options.spaceId ?? SPACE,
      name,
      args,
    } as { mutationId: string },
    { userId: ALICE, clientId: 'client-1' },
  );
}

const spaceVersion = (id = SPACE) =>
  database.db.select().from(schema.spaces).where(eq(schema.spaces.id, id)).get()
    ?.version;
const listRow = (id: string) =>
  database.db.select().from(schema.lists).where(eq(schema.lists.id, id)).get();
const itemRow = (id: string) =>
  database.db.select().from(schema.items).where(eq(schema.items.id, id)).get();

function createList(title = 'Camping') {
  const id = newId();
  push('list.create', { id, title });
  return id;
}

function createItem(listId: string, title = 'Tent') {
  const id = newId();
  push('item.create', { id, listId, title, position: 'a0' });
  return id;
}

describe('MutationService', () => {
  describe('versions', () => {
    it('applies a mutation, raises the space version by one and stamps the row', () => {
      const id = newId();

      const applied = push('list.create', {
        id,
        title: ' Camping ',
        description: 'Summer',
      });

      expect(applied.result).toMatchObject({ status: 'ack', version: 1 });
      expect(spaceVersion()).toBe(1);
      expect(listRow(id)).toEqual(
        makeList({
          id,
          spaceId: SPACE,
          createdBy: ALICE,
          updatedBy: ALICE,
          createdAt: now,
          updatedAt: now,
          title: 'Camping',
          description: 'Summer',
        }),
      );
      expect(applied.spaceId).toBe(SPACE);
      expect(applied.rows.lists).toEqual([listRow(id)]);
      expect(applied.rows.items).toEqual([]);
    });

    it('gives every mutation the next version; unchanged rows keep theirs', () => {
      const first = createList('One');
      const second = createList('Two');
      push('list.update', { id: second, patch: { title: 'Two!' } });

      expect(spaceVersion()).toBe(3);
      expect(listRow(first)?.version).toBe(1);
      expect(listRow(second)?.version).toBe(3);
    });

    it('counts versions per space', () => {
      createList();
      push(
        'list.create',
        { id: newId(), title: 'Elsewhere' },
        { spaceId: OTHER_SPACE },
      );

      expect(spaceVersion(SPACE)).toBe(1);
      expect(spaceVersion(OTHER_SPACE)).toBe(1);
    });
  });

  describe('per-field patches', () => {
    it('changes only the fields in the patch', () => {
      const id = newId();
      push('list.create', { id, title: 'Camping', description: 'Summer' });
      now += 1000;

      push('list.update', { id, patch: { description: 'Autumn' } });

      expect(listRow(id)).toMatchObject({
        title: 'Camping',
        description: 'Autumn',
        updatedAt: now,
        createdAt: now - 1000,
        version: 2,
      });
    });

    it('stores a list colour and icon, and null clears them (D26)', () => {
      const id = newId();
      push('list.create', { id, title: 'Camping' });
      expect(listRow(id)).toMatchObject({ colour: null, icon: null });

      push('list.update', { id, patch: { colour: 'teal', icon: 'camping' } });
      expect(listRow(id)).toMatchObject({ colour: 'teal', icon: 'camping' });

      push('list.update', { id, patch: { icon: null } });
      expect(listRow(id)).toMatchObject({ colour: 'teal', icon: null });
    });

    it('updates, moves and keeps the other item fields', () => {
      const listId = createList();
      const id = newId();
      push('item.create', {
        id,
        listId,
        title: 'Socks',
        quantity: '2 pairs',
        note: 'wool',
        position: 'a0',
      });

      push('item.update', { id, patch: { quantity: '3 pairs' } });
      push('item.move', { id, position: 'a1' });

      expect(itemRow(id)).toMatchObject({
        title: 'Socks',
        quantity: '3 pairs',
        note: 'wool',
        position: 'a1',
        version: 4,
      });
    });

    it('takes the last write per field (two clients editing different fields)', () => {
      const listId = createList();
      const id = createItem(listId);

      push('item.update', { id, patch: { title: 'Tent (2p)' } });
      push('item.update', { id, patch: { note: 'check poles' } });
      push('item.update', { id, patch: { title: 'Tent (3p)' } });

      expect(itemRow(id)).toMatchObject({
        title: 'Tent (3p)',
        note: 'check poles',
      });
    });
  });

  describe('delete wins', () => {
    it('tombstones a list and ignores later updates to it', () => {
      const id = createList();
      now += 1;
      push('list.delete', { id });

      const applied = push('list.update', { id, patch: { title: 'Too late' } });

      expect(applied.result).toEqual({
        mutationId: applied.result.mutationId,
        status: 'ack',
        version: 2,
      });
      expect(applied.rows).toEqual({
        lists: [],
        items: [],
        includes: [],
        runs: [],
        runItems: [],
      });
      expect(spaceVersion()).toBe(2);
      expect(listRow(id)).toMatchObject({
        title: 'Camping',
        deletedAt: now,
        version: 2,
      });
    });

    it('ignores updates and moves of a deleted item, and a second delete', () => {
      const listId = createList();
      const id = createItem(listId);
      push('item.delete', { id });

      push('item.update', { id, patch: { title: 'Too late' } });
      push('item.move', { id, position: 'a5' });
      push('item.delete', { id });

      expect(itemRow(id)).toMatchObject({
        title: 'Tent',
        position: 'a0',
        version: 3,
      });
      expect(spaceVersion()).toBe(3);
    });

    it('restores deleted lists and items', () => {
      const listId = createList();
      const id = createItem(listId);
      push('item.delete', { id });
      push('list.delete', { id: listId });

      push('list.restore', { id: listId });
      push('item.restore', { id });

      expect(listRow(listId)?.deletedAt).toBeNull();
      expect(itemRow(id)?.deletedAt).toBeNull();
      expect(spaceVersion()).toBe(6);
    });

    it('ignores new items and changes to items in a deleted list (design §2.4)', () => {
      const listId = createList();
      const id = createItem(listId);
      const gone = createItem(listId, 'Lamp');
      push('item.delete', { id: gone });
      push('list.delete', { id: listId });
      const before = spaceVersion();

      const results = [
        push('item.create', {
          id: newId(),
          listId,
          title: 'Stove',
          position: 'a1',
        }),
        push('item.update', { id, patch: { title: 'Too late' } }),
        push('item.move', { id, position: 'a5' }),
        push('item.delete', { id }),
        push('item.restore', { id: gone }),
      ].map((applied) => applied.result);

      expect(results).toEqual(
        results.map((r) => ({
          mutationId: r.mutationId,
          status: 'ack',
          version: before,
        })),
      );
      expect(spaceVersion()).toBe(before);
      expect(itemRow(id)).toMatchObject({
        title: 'Tent',
        position: 'a0',
        deletedAt: null,
      });
      expect(itemRow(gone)?.deletedAt).not.toBeNull();
      expect(database.db.select().from(schema.items).all()).toHaveLength(2);
    });

    it('acks restoring a row that is not deleted, without a change', () => {
      const listId = createList();
      const id = createItem(listId);

      expect(push('list.restore', { id: listId }).result).toMatchObject({
        status: 'ack',
        version: 2,
      });
      expect(push('item.restore', { id }).result).toMatchObject({
        status: 'ack',
        version: 2,
      });
      expect(push('list.delete', { id: listId }).result).toMatchObject({
        version: 3,
      });
      expect(push('list.delete', { id: listId }).result).toMatchObject({
        version: 3,
      });
      expect(spaceVersion()).toBe(3);
    });

    it('returns the changed item rows for the poke', () => {
      const listId = createList();
      const id = createItem(listId);

      const applied = push('item.move', { id, position: 'a5' });

      expect(applied.spaceId).toBe(SPACE);
      expect(applied.rows).toEqual({
        lists: [],
        items: [itemRow(id)],
        includes: [],
        runs: [],
        runItems: [],
      });
      expect(applied.rows.items[0]).toMatchObject({
        position: 'a5',
        version: 3,
      });
    });
  });

  describe('retries', () => {
    it('applies a repeated mutation id once and gives the same answer', () => {
      const mutationId = newId();
      const id = newId();

      const first = push(
        'list.create',
        { id, title: 'Camping' },
        { mutationId },
      );
      const again = push(
        'list.create',
        { id, title: 'Camping' },
        { mutationId },
      );

      expect(again.result).toEqual(first.result);
      expect(again.rows).toEqual({
        lists: [],
        items: [],
        includes: [],
        runs: [],
        runItems: [],
      });
      expect(spaceVersion()).toBe(1);
    });

    it('gives a retried rejection the same reason', () => {
      const mutationId = newId();
      const args = { id: newId(), patch: { title: 'x' } };

      const first = push('list.update', args, { mutationId });
      const again = push('list.update', args, { mutationId });

      expect(first.result).toMatchObject({ status: 'reject' });
      expect(again.result).toEqual(first.result);
    });

    it('acks a retried create whose record is gone (creates are idempotent by id)', () => {
      const id = newId();
      push('list.create', { id, title: 'Camping' });
      database.db.delete(schema.processedMutations).run();

      const again = push('list.create', { id, title: 'Camping' });

      expect(again.result).toMatchObject({ status: 'ack', version: 1 });
      expect(spaceVersion()).toBe(1);
    });

    it('does not hand out a stored answer for another space', () => {
      const mutationId = newId();
      push('list.create', { id: newId(), title: 'Camping' }, { mutationId });

      const reused = push(
        'list.delete',
        { id: newId() },
        { mutationId, spaceId: OTHER_SPACE },
      );

      expect(reused.result).toMatchObject({
        status: 'reject',
        reason: 'This change id was already used',
      });
    });

    it('records who answered and when', () => {
      const mutationId = newId();
      push('list.create', { id: newId(), title: 'Camping' }, { mutationId });

      expect(
        database.db
          .select()
          .from(schema.processedMutations)
          .where(eq(schema.processedMutations.mutationId, mutationId))
          .get(),
      ).toEqual({
        mutationId,
        spaceId: SPACE,
        clientId: 'client-1',
        result: '{"version":1}',
        createdAt: now,
      });
    });
  });

  describe('rejections', () => {
    it.each([
      [
        'a blank title',
        'list.create',
        { id: newId(), title: ' ' },
        'A title is required',
      ],
      [
        'an unknown mutation',
        'item.toggle',
        { id: newId() },
        expect.any(String),
      ],
      [
        'an empty patch',
        'item.update',
        { id: newId(), patch: {} },
        'Nothing to change',
      ],
    ] as const)(
      'rejects %s with a reason and changes nothing',
      (_, name, args, reason) => {
        const applied = push(name as MutationInput['name'], args);

        expect(applied.result).toMatchObject({ status: 'reject', reason });
        expect(spaceVersion()).toBe(0);
      },
    );

    it('records nothing for invalid entries, so junk stays out', () => {
      push('list.create', { id: newId(), title: ' ' });
      service.apply(
        { mutationId: newId(), spaceId: 'x'.repeat(100_000) } as {
          mutationId: string;
        },
        { userId: ALICE },
      );

      expect(
        database.db.select().from(schema.processedMutations).all(),
      ).toEqual([]);
    });

    it.each([
      ['list.update', { patch: { title: 'x' } }, "This list doesn't exist"],
      ['list.delete', {}, "This list doesn't exist"],
      ['list.restore', {}, "This list doesn't exist"],
      ['item.update', { patch: { title: 'x' } }, "This item doesn't exist"],
      ['item.move', { position: 'a1' }, "This item doesn't exist"],
      ['item.delete', {}, "This item doesn't exist"],
      ['item.restore', {}, "This item doesn't exist"],
    ] as const)(
      'rejects %s of a missing row and changes nothing',
      (name, extra, reason) => {
        createList();

        const applied = push(name, { id: newId(), ...extra });

        expect(applied.result).toMatchObject({ status: 'reject', reason });
        expect(spaceVersion()).toBe(1);
      },
    );

    it('rejects changes to rows that do not exist', () => {
      expect(
        push('list.update', { id: newId(), patch: { title: 'x' } }).result,
      ).toMatchObject({
        status: 'reject',
        reason: "This list doesn't exist",
      });
      expect(push('item.delete', { id: newId() }).result).toMatchObject({
        status: 'reject',
        reason: "This item doesn't exist",
      });
      expect(
        push('item.create', {
          id: newId(),
          listId: newId(),
          title: 'x',
          position: 'a0',
        }).result,
      ).toMatchObject({ status: 'reject', reason: "This list doesn't exist" });
    });

    it("rejects a mutation for a space the user isn't in, and one that doesn't exist, alike", () => {
      const id = newId();
      const asBen = (spaceId: string) =>
        service.apply(
          {
            mutationId: newId(),
            spaceId,
            name: 'list.create',
            args: { id, title: 'x' },
          } as { mutationId: string },
          { userId: BEN },
        );

      for (const spaceId of [SPACE, newId()]) {
        expect(asBen(spaceId)).toMatchObject({
          result: { status: 'reject', reason: "You can't change this space" },
          spaceId: null,
        });
      }

      expect(listRow(id)).toBeUndefined();
      expect(spaceVersion()).toBe(0);
      expect(
        database.db.select().from(schema.processedMutations).all(),
      ).toEqual([]);
    });

    it('gives a removed member no stored answer for an old mutation id', () => {
      const mutationId = newId();
      push('list.create', { id: newId(), title: 'x' }, { mutationId });
      database.db.delete(schema.memberships).run();

      expect(
        push('list.create', { id: newId(), title: 'x' }, { mutationId }).result,
      ).toMatchObject({
        status: 'reject',
        reason: "You can't change this space",
      });
    });

    it('keeps spaces apart: no reaching rows of another space', () => {
      const id = createList();

      const applied = push(
        'list.update',
        { id, patch: { title: 'Hijacked' } },
        { spaceId: OTHER_SPACE },
      );

      expect(applied.result).toMatchObject({ status: 'reject' });
      expect(listRow(id)?.title).toBe('Camping');
      expect(spaceVersion(OTHER_SPACE)).toBe(0);
      expect(
        push(
          'item.create',
          { id: newId(), listId: id, title: 'x', position: 'a0' },
          { spaceId: OTHER_SPACE },
        ).result,
      ).toMatchObject({ status: 'reject', reason: "This list doesn't exist" });
    });

    it('rejects creating a row with an id that is already taken', () => {
      const id = createList();

      expect(
        push('list.create', { id, title: 'Again' }, { spaceId: OTHER_SPACE })
          .result,
      ).toMatchObject({ status: 'reject', reason: 'This list already exists' });
    });
  });
});

describe('includes', () => {
  const includeRow = (id: string) =>
    database.db
      .select()
      .from(schema.includes)
      .where(eq(schema.includes.id, id))
      .get();
  function include(parentListId: string, childListId: string) {
    const id = newId();
    const applied = push('include.create', {
      id,
      parentListId,
      childListId,
      position: 'a1',
    });
    return { id, applied };
  }

  it('stores an include and returns it for the poke', () => {
    const trip = createList('Trip');
    const camping = createList('Camping');
    const { id, applied } = include(trip, camping);

    expect(applied.result).toMatchObject({ status: 'ack', version: 3 });
    expect(includeRow(id)).toMatchObject({
      parentListId: trip,
      childListId: camping,
      position: 'a1',
      version: 3,
      createdBy: ALICE,
    });
    expect(applied.rows).toEqual({
      lists: [],
      items: [],
      includes: [includeRow(id)],
      runs: [],
      runItems: [],
    });
  });

  it('rejects closing a loop, reading the includes from SQLite', () => {
    const a = createList('A');
    const b = createList('B');
    const c = createList('C');
    include(a, b);
    include(b, c);

    const { id, applied } = include(c, a);
    expect(applied.result).toEqual({
      mutationId: expect.any(String),
      status: 'reject',
      reason: 'That would make a loop: “A” already contains “C”',
    });
    expect(includeRow(id)).toBeUndefined();
    expect(spaceVersion()).toBe(5);
  });

  it('moves, removes and restores an include', () => {
    const { id } = include(createList('A'), createList('B'));
    push('include.move', { id, position: 'a3' });
    push('include.delete', { id });
    expect(includeRow(id)).toMatchObject({ position: 'a3', deletedAt: now });
    push('include.restore', { id });
    expect(includeRow(id)).toMatchObject({ deletedAt: null });
  });
});

describe('transactions', () => {
  it('rolls back everything, version included, when a write fails', () => {
    const listId = createList();
    database.sqlite.exec(
      "CREATE TRIGGER fail BEFORE INSERT ON items BEGIN SELECT RAISE(ABORT, 'disk full'); END;",
    );

    expect(() =>
      push('item.create', {
        id: newId(),
        listId,
        title: 'Tent',
        position: 'a0',
      }),
    ).toThrow(/disk full/);
    expect(spaceVersion()).toBe(1);
    expect(
      database.db.select().from(schema.processedMutations).all(),
    ).toHaveLength(1);
  });
});
