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
import { SyncGateway } from '@lister/api/feature-sync';
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
  constructor(
    private readonly database: DatabaseConnection,
    private readonly sync: SyncGateway,
  ) {}

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
    const created = this.database.sqlite.transaction(() => {
      const space = insertSpace(this.database.db, {
        name,
        ownerId: userId,
        personal: false,
        now: Date.now(),
      });
      return this.summary(space.id, userId);
    })();
    this.sync.membershipsChanged([userId]);
    return created;
  }

  rename(userId: string, spaceId: string, name: string): SpaceSummary {
    const renamed = this.database.sqlite.transaction(() => {
      this.requireOwner(userId, spaceId);
      this.database.db
        .update(spaces)
        .set({ name })
        .where(eq(spaces.id, spaceId))
        .run();
      return this.summary(spaceId, userId);
    })();
    this.sync.membershipsChanged(renamed.members.map((m) => m.userId));
    return renamed;
  }

  /** Deletes a shared space with everything in it. Personal spaces go with their user. */
  remove(userId: string, spaceId: string): void {
    const members = this.database.sqlite.transaction(() => {
      const space = this.requireOwner(userId, spaceId);
      if (space.personal) {
        throw new ConflictException("A personal space can't be deleted");
      }
      const members = this.memberIds(spaceId);
      deleteSpace(this.database.db, spaceId);
      return members;
    })();
    this.sync.membershipsChanged(members);
  }

  addMember(userId: string, spaceId: string, username: string): SpaceSummary {
    const added = this.database.sqlite.transaction(() => {
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
    this.sync.membershipsChanged(added.members.map((m) => m.userId));
    return added;
  }

  /** The owner removes another member. The owner can't be removed: delete the space instead. */
  removeMember(userId: string, spaceId: string, memberId: string): void {
    const members = this.database.sqlite.transaction(() => {
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
      const members = this.memberIds(spaceId);
      this.deleteMembership(spaceId, memberId);
      return members;
    })();
    // The removed member's connected clients leave the space's room now and drop the space;
    // the others see the new member list (design §4.2).
    this.sync.membershipsChanged(members);
  }

  /** A member leaves. The owner can't: they delete the space (there's no hand-over yet). */
  leave(userId: string, spaceId: string): void {
    const members = this.database.sqlite.transaction(() => {
      const membership = this.requireMember(userId, spaceId);
      if (membership.personal) {
        throw new ConflictException("You can't leave your personal space");
      }
      if (membership.role === 'owner') {
        throw new ConflictException(
          "The owner can't leave: delete the space instead",
        );
      }
      const members = this.memberIds(spaceId);
      this.deleteMembership(spaceId, userId);
      return members;
    })();
    this.sync.membershipsChanged(members);
  }

  private memberIds(spaceId: string): string[] {
    return this.database.db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(eq(memberships.spaceId, spaceId))
      .all()
      .map((row) => row.userId);
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
