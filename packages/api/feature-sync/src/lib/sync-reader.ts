import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { DatabaseConnection, schema } from '@lister/api/data-access-db';
import type { Rows, Welcome } from '@lister/shared/sync-protocol';

const {
  includeExceptions,
  includes,
  items,
  lists,
  memberships,
  runItems,
  runs,
  spaces,
  users,
} = schema;

/** One space of the welcome: the space with its members' display names. */
export type WelcomeSpace = Welcome['spaces'][number];

/** Reads for the sync protocol: the user's spaces, and the rows a client needs to catch up. */
@Injectable()
export class SyncReader {
  constructor(private readonly database: DatabaseConnection) {}

  /**
   * The spaces the user belongs to (their personal space first, then by name), each with its
   * members' display names, for the welcome.
   */
  spacesOf(userId: string): WelcomeSpace[] {
    return this.database.db.transaction((tx) => {
      const mine = tx
        .select({ id: spaces.id, name: spaces.name, version: spaces.version })
        .from(memberships)
        .innerJoin(spaces, eq(spaces.id, memberships.spaceId))
        .where(eq(memberships.userId, userId))
        .orderBy(
          desc(spaces.personal),
          asc(sql`lower(${spaces.name})`),
          asc(spaces.id),
        )
        .all();
      if (mine.length === 0) return [];
      const members = tx
        .select({
          spaceId: memberships.spaceId,
          userId: users.id,
          displayName: users.displayName,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          inArray(
            memberships.spaceId,
            mine.map((space) => space.id),
          ),
        )
        .orderBy(
          // The owner first, then the others by name.
          asc(sql`${memberships.role} = 'member'`),
          asc(sql`lower(${users.displayName})`),
          asc(users.id),
        )
        .all();
      return mine.map((space) => ({
        ...space,
        members: members
          .filter((member) => member.spaceId === space.id)
          .map(({ userId: id, displayName }) => ({ userId: id, displayName })),
      }));
    });
  }

  /** Whether the user belongs to the space. */
  isMember(userId: string, spaceId: string): boolean {
    return (
      this.database.db
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(
          and(eq(memberships.spaceId, spaceId), eq(memberships.userId, userId)),
        )
        .get() !== undefined
    );
  }

  /**
   * Every row of the space changed after `since`, tombstones included, read in one transaction
   * so `version` matches the rows. `since: 0` is a full snapshot. So is a `since` before the
   * space's purge point (the purge removed rows the client may still hold, D15), and a
   * `since` ahead of the server (its database was reset), and a `timeline` other than the
   * space's (a restore changed it): the client must replace its copy, or it would never converge.
   */
  rowsSince(
    spaceId: string,
    since: number,
    timeline: string,
  ): Rows | undefined {
    return this.database.db.transaction((tx) => {
      const space = tx
        .select()
        .from(spaces)
        .where(eq(spaces.id, spaceId))
        .get();
      if (!space) return undefined;
      const snapshot =
        since === 0 ||
        timeline !== space.timeline ||
        since > space.version ||
        since < space.purgedVersion;
      const from = snapshot ? 0 : since;
      const changed = (
        table:
          | typeof lists
          | typeof items
          | typeof includes
          | typeof includeExceptions
          | typeof runs
          | typeof runItems,
      ) => and(eq(table.spaceId, spaceId), gt(table.version, from));
      return {
        spaceId,
        version: space.version,
        timeline: space.timeline,
        snapshot,
        rows: {
          lists: tx.select().from(lists).where(changed(lists)).all(),
          items: tx.select().from(items).where(changed(items)).all(),
          includes: tx.select().from(includes).where(changed(includes)).all(),
          includeExceptions: tx
            .select()
            .from(includeExceptions)
            .where(changed(includeExceptions))
            .all(),
          runs: tx.select().from(runs).where(changed(runs)).all(),
          runItems: tx.select().from(runItems).where(changed(runItems)).all(),
        },
      };
    });
  }
}
