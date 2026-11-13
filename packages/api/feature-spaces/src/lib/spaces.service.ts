import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  DatabaseConnection,
  deleteSpace,
  findUserByUsername,
  insertSpace,
  schema,
} from '@lister/api/data-access-db';
import type { SpaceMember, SpaceSummary } from '@lister/shared/api-contracts';

const { memberships, spaces, users } = schema;

/**
 * Spaces and memberships (design D14). A space no one belongs to doesn't exist as far as a caller
 * is concerned (404, not 403), so ids can't be probed; members who aren't the owner get 403 on
 * owner-only actions. Every write is one synchronous transaction, so the checks and the change
 * can't be split by a concurrent request.
 */
@Injectable()
export class SpacesService {
  constructor(private readonly database: DatabaseConnection) {}

  /** The spaces the user belongs to: their personal space first, then the others by name. */
  list(userId: string): SpaceSummary[] {
    const mine = this.database.db
      .select({
        id: spaces.id,
        name: spaces.name,
        personal: spaces.personal,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(spaces, eq(spaces.id, memberships.spaceId))
      .where(eq(memberships.userId, userId))
      .orderBy(desc(spaces.personal), asc(sql`lower(${spaces.name})`))
      .all();
    if (mine.length === 0) return [];
    const members = this.membersOf(mine.map((space) => space.id));
    return mine.map((space) => ({
      ...space,
      members: members.get(space.id) ?? [],
    }));
  }

  create(userId: string, name: string): SpaceSummary {
    return this.database.sqlite.transaction(() => {
      const space = insertSpace(this.database.db, {
        name,
        ownerId: userId,
        personal: false,
        now: Date.now(),
      });
      return this.summary(space.id, userId);
    })();
  }

  rename(userId: string, spaceId: string, name: string): SpaceSummary {
    return this.database.sqlite.transaction(() => {
      this.requireOwner(userId, spaceId);
      this.database.db
        .update(spaces)
        .set({ name })
        .where(eq(spaces.id, spaceId))
        .run();
      return this.summary(spaceId, userId);
    })();
  }

  /** Deletes a shared space with everything in it. Personal spaces go with their user. */
  remove(userId: string, spaceId: string): void {
    this.database.sqlite.transaction(() => {
      const space = this.requireOwner(userId, spaceId);
      if (space.personal) {
        throw new ConflictException("A personal space can't be deleted");
      }
      deleteSpace(this.database.db, spaceId);
    })();
  }

  addMember(userId: string, spaceId: string, username: string): SpaceSummary {
    return this.database.sqlite.transaction(() => {
      const space = this.requireOwner(userId, spaceId);
      if (space.personal) {
        throw new ConflictException("A personal space can't be shared");
      }
      const user = findUserByUsername(this.database.db, username);
      if (!user) throw new NotFoundException('There is no such user');
      const already = this.database.db
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.spaceId, spaceId),
            eq(memberships.userId, user.id),
          ),
        )
        .get();
      if (already) throw new ConflictException('Already a member');
      this.database.db
        .insert(memberships)
        .values({
          spaceId,
          userId: user.id,
          role: 'member',
          createdAt: Date.now(),
        })
        .run();
      return this.summary(spaceId, userId);
    })();
  }

  /** The owner removes another member. The owner can't be removed: delete the space instead. */
  removeMember(userId: string, spaceId: string, memberId: string): void {
    this.database.sqlite.transaction(() => {
      this.requireOwner(userId, spaceId);
      const target = this.database.db
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.spaceId, spaceId),
            eq(memberships.userId, memberId),
          ),
        )
        .get();
      if (!target) throw new NotFoundException('That user is not a member');
      if (target.role === 'owner') {
        throw new ConflictException("The owner can't be removed");
      }
      this.deleteMembership(spaceId, memberId);
    })();
  }

  /** A member leaves. The owner can't: they delete the space (there's no hand-over yet). */
  leave(userId: string, spaceId: string): void {
    this.database.sqlite.transaction(() => {
      const membership = this.requireMember(userId, spaceId);
      if (membership.personal) {
        throw new ConflictException("You can't leave your personal space");
      }
      if (membership.role === 'owner') {
        throw new ConflictException(
          "The owner can't leave: delete the space instead",
        );
      }
      this.deleteMembership(spaceId, userId);
    })();
  }

  private deleteMembership(spaceId: string, userId: string): void {
    this.database.db
      .delete(memberships)
      .where(
        and(eq(memberships.spaceId, spaceId), eq(memberships.userId, userId)),
      )
      .run();
  }

  /** The user's membership of the space, or 404. */
  private requireMember(userId: string, spaceId: string) {
    const row = this.database.db
      .select({
        role: memberships.role,
        personal: spaces.personal,
      })
      .from(memberships)
      .innerJoin(spaces, eq(spaces.id, memberships.spaceId))
      .where(
        and(eq(memberships.spaceId, spaceId), eq(memberships.userId, userId)),
      )
      .get();
    if (!row) throw new NotFoundException('There is no such space');
    return row;
  }

  private requireOwner(userId: string, spaceId: string) {
    const row = this.requireMember(userId, spaceId);
    if (row.role !== 'owner') {
      throw new ForbiddenException('Only the space owner can do that');
    }
    return row;
  }

  private summary(spaceId: string, userId: string): SpaceSummary {
    const found = this.list(userId).find((space) => space.id === spaceId);
    if (!found) throw new NotFoundException('There is no such space');
    return found;
  }

  private membersOf(spaceIds: string[]): Map<string, SpaceMember[]> {
    const rows = this.database.db
      .select({
        spaceId: memberships.spaceId,
        userId: memberships.userId,
        displayName: users.displayName,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(inArray(memberships.spaceId, spaceIds))
      .orderBy(
        // The owner first, then the others by name.
        asc(sql`${memberships.role} = 'member'`),
        asc(sql`lower(${users.displayName})`),
        asc(users.id),
      )
      .all();
    const bySpace = new Map<string, SpaceMember[]>();
    for (const { spaceId, ...member } of rows) {
      const list = bySpace.get(spaceId) ?? [];
      list.push(member);
      bySpace.set(spaceId, list);
    }
    return bySpace;
  }
}
