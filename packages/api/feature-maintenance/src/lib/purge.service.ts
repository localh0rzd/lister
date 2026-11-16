import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNotNull, lt, or, sql } from 'drizzle-orm';
import { DatabaseConnection, schema } from '@lister/api/data-access-db';

const { appMeta, includes, items, lists, runItems, runs, spaces } = schema;

/** Tombstones and finished runs are kept this long (D15). */
export const PURGE_AFTER_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;
const LAST_PURGE_KEY = 'purge.lastDay';

/**
 * The daily purge (D15): deletes tombstones and finished runs older than 30 days for good, with
 * the rows that only exist for them (the items and includes of a purged list, the items of a
 * purged run). Each space remembers its purge point (`spaces.purgedVersion`), the highest
 * version among the rows removed: a client that last synced before it gets a full snapshot on
 * its next pull, because it may have missed a tombstone.
 */
@Injectable()
export class PurgeService {
  constructor(private readonly database: DatabaseConnection) {}

  /** Purges everything older than 30 days as of `now`. Returns how many rows were removed. */
  purge(now: number): number {
    const cutoff = now - PURGE_AFTER_DAYS * DAY;
    return this.database.db.transaction((tx) => {
      const purgedVersions = new Map<string, number>();
      const note = (rows: { spaceId: string; version: number }[]) => {
        for (const { spaceId, version } of rows) {
          purgedVersions.set(
            spaceId,
            Math.max(purgedVersions.get(spaceId) ?? 0, version),
          );
        }
        return rows.length;
      };

      const oldRuns = or(
        and(isNotNull(runs.deletedAt), lt(runs.deletedAt, cutoff)),
        and(isNotNull(runs.finishedAt), lt(runs.finishedAt, cutoff)),
      );
      const oldLists = and(
        isNotNull(lists.deletedAt),
        lt(lists.deletedAt, cutoff),
      );
      const oldRunIds = tx.select({ id: runs.id }).from(runs).where(oldRuns);
      const oldListIds = tx
        .select({ id: lists.id })
        .from(lists)
        .where(oldLists);

      let removed = 0;
      // Children first: the foreign keys point from items, includes and run items to their
      // parents.
      removed += note(
        tx
          .delete(runItems)
          .where(
            or(
              and(
                isNotNull(runItems.deletedAt),
                lt(runItems.deletedAt, cutoff),
              ),
              inArray(runItems.runId, oldRunIds),
            ),
          )
          .returning({ spaceId: runItems.spaceId, version: runItems.version })
          .all(),
      );
      removed += note(
        tx
          .delete(runs)
          .where(oldRuns)
          .returning({ spaceId: runs.spaceId, version: runs.version })
          .all(),
      );
      removed += note(
        tx
          .delete(items)
          .where(
            or(
              and(isNotNull(items.deletedAt), lt(items.deletedAt, cutoff)),
              inArray(items.listId, oldListIds),
            ),
          )
          .returning({ spaceId: items.spaceId, version: items.version })
          .all(),
      );
      removed += note(
        tx
          .delete(includes)
          .where(
            or(
              and(
                isNotNull(includes.deletedAt),
                lt(includes.deletedAt, cutoff),
              ),
              inArray(includes.parentListId, oldListIds),
              inArray(includes.childListId, oldListIds),
            ),
          )
          .returning({ spaceId: includes.spaceId, version: includes.version })
          .all(),
      );
      removed += note(
        tx
          .delete(lists)
          .where(oldLists)
          .returning({ spaceId: lists.spaceId, version: lists.version })
          .all(),
      );

      for (const [spaceId, version] of purgedVersions) {
        tx.update(spaces)
          .set({ purgedVersion: sql`max(${spaces.purgedVersion}, ${version})` })
          .where(eq(spaces.id, spaceId))
          .run();
      }
      return removed;
    });
  }

  /** Whether the purge hasn't run yet on the UTC day of `now`. */
  isDue(now: number): boolean {
    return this.lastDay() !== dayOf(now);
  }

  /** Records that the purge ran on the UTC day of `now`. */
  markDone(now: number): void {
    this.database.db
      .insert(appMeta)
      .values({ key: LAST_PURGE_KEY, value: dayOf(now) })
      .onConflictDoUpdate({ target: appMeta.key, set: { value: dayOf(now) } })
      .run();
  }

  private lastDay(): string | undefined {
    return this.database.db
      .select({ value: appMeta.value })
      .from(appMeta)
      .where(eq(appMeta.key, LAST_PURGE_KEY))
      .get()?.value;
  }
}

function dayOf(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}
