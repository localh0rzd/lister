import { Injectable } from '@nestjs/common';
import { and, eq, gt } from 'drizzle-orm';
import { DatabaseConnection, schema } from '@lister/api/data-access-db';
import type { Space } from '@lister/shared/domain';
import type { Rows } from '@lister/shared/sync-protocol';
import { DEV_SPACE_ID } from './dev-seed';

const { includes, items, lists, runItems, runs, spaces } = schema;

/** Reads for the sync protocol: the user's spaces, and the rows a client needs to catch up. */
@Injectable()
export class SyncReader {
  constructor(private readonly database: DatabaseConnection) {}

  /**
   * The spaces an unauthenticated socket may use: only the dev space, and only where `DevSeed`
   * created it. The socket has no session check until T-025, so any other space (the personal
   * and shared spaces of T-024) must never be reachable through it. T-025 replaces this with the
   * signed-in user's memberships.
   */
  devSpaces(): Space[] {
    return this.database.db
      .select({ id: spaces.id, name: spaces.name, version: spaces.version })
      .from(spaces)
      .where(eq(spaces.id, DEV_SPACE_ID))
      .all();
  }

  /**
   * Every row of the space changed after `since`, tombstones included, read in one transaction
   * so `version` matches the rows. `since: 0` is a full snapshot (purge points: T-033). So is a
   * `since` ahead of the server (its database was restored or reset): the client must replace
   * its copy, or it would never converge.
   */
  rowsSince(spaceId: string, since: number): Rows | undefined {
    return this.database.db.transaction((tx) => {
      const space = tx
        .select()
        .from(spaces)
        .where(eq(spaces.id, spaceId))
        .get();
      if (!space) return undefined;
      const snapshot = since === 0 || since > space.version;
      const from = snapshot ? 0 : since;
      const changed = (
        table:
          | typeof lists
          | typeof items
          | typeof includes
          | typeof runs
          | typeof runItems,
      ) => and(eq(table.spaceId, spaceId), gt(table.version, from));
      return {
        spaceId,
        version: space.version,
        snapshot,
        rows: {
          lists: tx.select().from(lists).where(changed(lists)).all(),
          items: tx.select().from(items).where(changed(items)).all(),
          includes: tx.select().from(includes).where(changed(includes)).all(),
          runs: tx.select().from(runs).where(changed(runs)).all(),
          runItems: tx.select().from(runItems).where(changed(runItems)).all(),
        },
      };
    });
  }
}
