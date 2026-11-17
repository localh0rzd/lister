import { Dexie } from 'dexie';
import { newId } from '@lister/shared/domain';
import { LocalDb } from './local-db';

/** The schema as version 3 of the app had it (before includes). */
function openVersion3(name: string) {
  const old = new Dexie(name);
  old.version(3).stores({
    spaces: 'id, name',
    lists: 'id, spaceId',
    items: 'id, listId, spaceId',
    serverLists: 'id, spaceId',
    serverItems: 'id, listId, spaceId',
    outbox: '++seq, &mutationId, spaceId',
    syncState: 'spaceId',
    meta: 'key',
    rejections: 'mutationId, at',
  });
  return old;
}

describe('LocalDb upgrades', () => {
  it('version 4 (includes) forgets the sync position, so the next pull is a snapshot', async () => {
    const name = `upgrade-${newId()}`;
    const spaceId = newId();
    const mutationId = newId();
    const old = openVersion3(name);
    await old.table('syncState').put({ spaceId, version: 7, lastSyncedAt: 1 });
    await old.table('outbox').add({
      mutationId,
      spaceId,
      mutation: {
        mutationId,
        spaceId,
        name: 'list.delete',
        args: { id: newId() },
      },
      createdAt: 1,
    });
    old.close();

    const db = new LocalDb(name);
    try {
      expect(await db.syncState.count()).toBe(0);
      // Pending changes survive: they're sent after the snapshot.
      expect(await db.outbox.toArray()).toEqual([
        expect.objectContaining({ mutationId }),
      ]);
      expect(await db.includes.count()).toBe(0);
    } finally {
      await db.delete();
    }
  });
});

describe('LocalDb upgrade to version 8 (list colour and icon)', () => {
  it('forgets the sync position, so the next pull brings the new fields, and keeps the outbox', async () => {
    const name = `upgrade8-${newId()}`;
    const spaceId = newId();
    const mutationId = newId();
    // The schema as version 7 of the app had it.
    const old = new Dexie(name);
    old.version(7).stores({
      spaces: 'id, name',
      lists: 'id, spaceId',
      items: 'id, listId, spaceId',
      serverLists: 'id, spaceId',
      serverItems: 'id, listId, spaceId',
      outbox: '++seq, &mutationId, spaceId',
      syncState: 'spaceId',
      meta: 'key',
      rejections: 'mutationId, at',
      includes: 'id, spaceId, parentListId, childListId',
      serverIncludes: 'id, spaceId, parentListId, childListId',
      runs: 'id, spaceId',
      runItems: 'id, spaceId, runId',
      serverRuns: 'id, spaceId',
      serverRunItems: 'id, spaceId, runId',
    });
    await old.table('syncState').put({ spaceId, version: 7, timeline: 'tl' });
    await old.table('outbox').add({
      mutationId,
      spaceId,
      mutation: {
        mutationId,
        spaceId,
        name: 'list.delete',
        args: { id: newId() },
      },
      createdAt: 1,
    });
    old.close();

    const db = new LocalDb(name);
    try {
      expect(await db.syncState.count()).toBe(0);
      expect(await db.outbox.toArray()).toEqual([
        expect.objectContaining({ mutationId }),
      ]);
    } finally {
      await db.delete();
    }
  });
});

describe('LocalDb upgrade to version 5 (runs)', () => {
  it('forgets the sync position again and keeps the outbox', async () => {
    const name = `upgrade5-${newId()}`;
    const spaceId = newId();
    const old = new Dexie(name);
    old.version(4).stores({
      spaces: 'id, name',
      lists: 'id, spaceId',
      items: 'id, listId, spaceId',
      serverLists: 'id, spaceId',
      serverItems: 'id, listId, spaceId',
      outbox: '++seq, &mutationId, spaceId',
      syncState: 'spaceId',
      meta: 'key',
      rejections: 'mutationId, at',
      includes: 'id, spaceId, parentListId, childListId',
      serverIncludes: 'id, spaceId, parentListId, childListId',
    });
    await old.table('syncState').put({ spaceId, version: 9, lastSyncedAt: 1 });
    const mutationId = newId();
    await old.table('outbox').add({
      mutationId,
      spaceId,
      mutation: {
        mutationId,
        spaceId,
        name: 'list.delete',
        args: { id: newId() },
      },
      createdAt: 1,
    });
    old.close();

    const db = new LocalDb(name);
    try {
      expect(await db.syncState.count()).toBe(0);
      expect(await db.outbox.count()).toBe(1);
      expect(await db.runs.count()).toBe(0);
    } finally {
      await db.delete();
    }
  });
});

describe('LocalDb.clearAll', () => {
  it('empties every table, pending changes and the remembered user included', async () => {
    const db = new LocalDb(`clear-${newId()}`);
    try {
      const spaceId = newId();
      await db.spaces.put({
        id: spaceId,
        name: 'Home',
        version: 1,
        members: [],
      });
      await db.meta.put({ key: 'userId', value: newId() });
      await db.syncState.put({
        spaceId,
        version: 3,
        timeline: 't1',
        lastSyncedAt: 1,
      });
      await db.outbox.add({
        mutationId: newId(),
        spaceId,
        mutation: {
          mutationId: newId(),
          spaceId,
          name: 'list.delete',
          args: { id: newId() },
        },
        createdAt: 1,
      });

      await db.clearAll();

      for (const table of db.tables) expect(await table.count()).toBe(0);
    } finally {
      await db.delete();
    }
  });
});
