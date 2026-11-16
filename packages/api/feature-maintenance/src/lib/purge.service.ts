import { Injectable } from '@nestjs/common';
import { eq, inArray, lt, or, sql } from 'drizzle-orm';
import { DatabaseConnection, schema } from '@lister/api/data-access-db';

const { appMeta, includes, items, lists, runItems, runs, spaces } = schema;

/** Tombstones and finished runs are kept this long (D15). */
export const PURGE_AFTER_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;
const LAST_PURGE_KEY = 'purge.lastDay';

/**
 * The daily purge (D15): deletes tombstones and finished runs older than 30 days for good, with
 * the rows that only exist for them (the items and includes of a purged list, the items of a
 * purged run). A space that lost rows moves one version on, and that version is its purge point
 * (`spaces.purgedVersion`): every client of the space is then behind it and gets a full snapshot
 * on its next pull. Up-to-date clients need one too: they still hold the purged tombstones, and
 * the live rows that went with a purged list or run, which no change ever told them about.
 * Nothing is poked: an empty poke at the next version would move a client past the purge point
 * without a snapshot. Connected clients see the gap at the space's next change and pull.
 */
@Injectable()
export class PurgeService {
  constructor(private readonly database: DatabaseConnection) {}

  /** Purges everything older than 30 days as of `now`. Returns how many rows were removed. */
  purge(now: number): number {
    const cutoff = now - PURGE_AFTER_DAYS * DAY;
    return this.database.db.transaction((tx) => {
      const purgedSpaces = new Set<string>();
      const note = (rows: { spaceId: string }[]) => {
        for (const { spaceId } of rows) purgedSpaces.add(spaceId);
        return rows.length;
      };

      // `lt` on a NULL timestamp is never true, so live rows are untouched.
      const oldRuns = or(
        lt(runs.deletedAt, cutoff),
        lt(runs.finishedAt, cutoff),
      );
      const oldLists = lt(lists.deletedAt, cutoff);
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
              lt(runItems.deletedAt, cutoff),
              inArray(runItems.runId, oldRunIds),
            ),
          )
          .returning({ spaceId: runItems.spaceId })
          .all(),
      );
      removed += note(
        tx
          .delete(runs)
          .where(oldRuns)
          .returning({ spaceId: runs.spaceId })
          .all(),
      );
      removed += note(
        tx
          .delete(items)
          .where(
            or(lt(items.deletedAt, cutoff), inArray(items.listId, oldListIds)),
          )
          .returning({ spaceId: items.spaceId })
          .all(),
      );
      removed += note(
        tx
          .delete(includes)
          .where(
            or(
              lt(includes.deletedAt, cutoff),
              inArray(includes.parentListId, oldListIds),
              inArray(includes.childListId, oldListIds),
            ),
          )
          .returning({ spaceId: includes.spaceId })
          .all(),
      );
      removed += note(
        tx
          .delete(lists)
          .where(oldLists)
          .returning({ spaceId: lists.spaceId })
          .all(),
      );

      if (purgedSpaces.size > 0) {
        // Both sides read the old version: the space and its purge point become version + 1.
        tx.update(spaces)
          .set({
            version: sql`${spaces.version} + 1`,
            purgedVersion: sql`${spaces.version} + 1`,
          })
          .where(inArray(spaces.id, [...purgedSpaces]))
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
