import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import {
  DatabaseConnection,
  deleteSpace,
  schema,
} from '@lister/api/data-access-db';
import type {
  CurrentUser,
  UpdateUserRequest,
} from '@lister/shared/api-contracts';
import { AccountEvents } from './account-events';
import { AuthService, toCurrentUser } from './auth.service';
import { hashPassword } from './password';

/** User administration (design §2.3). Every method is for admins; the controller enforces it. */
@Injectable()
export class UsersService {
  constructor(
    private readonly database: DatabaseConnection,
    private readonly auth: AuthService,
    private readonly events: AccountEvents = new AccountEvents(),
  ) {}

  list(): CurrentUser[] {
    return this.database.db
      .select()
      .from(schema.users)
      .orderBy(asc(sql`lower(${schema.users.username})`))
      .all()
      .map(toCurrentUser);
  }

  /** A new account with a temporary password the user must change at first sign-in. */
  async create(input: {
    username: string;
    displayName: string;
    temporaryPassword: string;
  }): Promise<CurrentUser> {
    return this.auth.createUser({
      username: input.username,
      displayName: input.displayName,
      password: input.temporaryPassword,
      isAdmin: false,
      mustChangePassword: true,
    });
  }

  /**
   * Edits a user. Demoting the last admin is a 409, checked in the same synchronous transaction
   * as the write, so two concurrent requests can't both demote the last two admins.
   */
  update(id: string, changes: UpdateUserRequest): CurrentUser {
    const updated = this.database.sqlite.transaction(() => {
      const row = this.find(id);
      if (changes.isAdmin === false && row.isAdmin) this.assertOtherAdmin(id);
      if (changes.username !== undefined) {
        const taken = this.auth.findByUsername(changes.username);
        if (taken && taken.id !== id) {
          throw new ConflictException('That username is taken');
        }
      }
      const values: Partial<typeof schema.users.$inferInsert> = {};
      if (changes.username !== undefined)
        values.username = changes.username.trim();
      if (changes.displayName !== undefined)
        values.displayName = changes.displayName.trim();
      if (changes.isAdmin !== undefined) values.isAdmin = changes.isAdmin;
      if (Object.keys(values).length === 0) return toCurrentUser(row);
      return toCurrentUser(
        this.database.db
          .update(schema.users)
          .set(values)
          .where(eq(schema.users.id, id))
          .returning()
          .get(),
      );
    })();
    // The welcome shows members' display names: the user's spaces get a fresh one.
    if (changes.displayName !== undefined) {
      this.events.emit({
        kind: 'membersChanged',
        userIds: [id, ...this.coMembersOf(id)],
      });
    }
    return updated;
  }

  /**
   * Deletes a user, their sessions and their personal space with its content. Shared spaces keep
   * their content (D14): one the user owned passes to its longest-standing other member, or is
   * deleted when nobody else is in it. The last admin can't be deleted (409).
   */
  remove(id: string): void {
    const coMembers = this.database.sqlite.transaction(() => {
      const row = this.find(id);
      if (row.isAdmin) this.assertOtherAdmin(id);
      const coMembers = this.coMembersOf(id);
      this.releaseSpaces(id);
      // Ended explicitly (not only by `on delete cascade`), so their sync sockets end at once.
      this.auth.endSessionsOf(id);
      // Memberships go with the user (`on delete cascade`).
      this.database.db
        .delete(schema.users)
        .where(eq(schema.users.id, id))
        .run();
      return coMembers;
    })();
    // The others' spaces lost a member (and maybe changed owner): they get a fresh welcome.
    if (coMembers.length > 0) {
      this.events.emit({ kind: 'membersChanged', userIds: coMembers });
    }
  }

  /** The other members of the user's spaces. */
  private coMembersOf(userId: string): string[] {
    const theirs = this.database.db
      .select({ spaceId: schema.memberships.spaceId })
      .from(schema.memberships)
      .where(eq(schema.memberships.userId, userId));
    return this.database.db
      .selectDistinct({ userId: schema.memberships.userId })
      .from(schema.memberships)
      .where(
        and(
          inArray(schema.memberships.spaceId, theirs),
          ne(schema.memberships.userId, userId),
        ),
      )
      .all()
      .map((row) => row.userId);
  }

  /**
   * Sets a temporary password, which must be changed at the next sign-in, ends the sessions and
   * removes the passkeys (D9).
   */
  async resetPassword(id: string, temporaryPassword: string): Promise<void> {
    this.find(id);
    const passwordHash = await hashPassword(temporaryPassword);
    this.database.sqlite.transaction(() => {
      this.find(id);
      this.database.db
        .update(schema.users)
        .set({ passwordHash, mustChangePassword: true })
        .where(eq(schema.users.id, id))
        .run();
      this.auth.revokeSignInsOf(id);
    })();
  }

  private releaseSpaces(userId: string): void {
    const { db } = this.database;
    const owned = db
      .select({ id: schema.spaces.id, personal: schema.spaces.personal })
      .from(schema.memberships)
      .innerJoin(
        schema.spaces,
        eq(schema.spaces.id, schema.memberships.spaceId),
      )
      .where(
        and(
          eq(schema.memberships.userId, userId),
          eq(schema.memberships.role, 'owner'),
        ),
      )
      .all();
    for (const space of owned) {
      const successor = space.personal
        ? undefined
        : db
            .select({ userId: schema.memberships.userId })
            .from(schema.memberships)
            .where(
              and(
                eq(schema.memberships.spaceId, space.id),
                ne(schema.memberships.userId, userId),
              ),
            )
            .orderBy(
              asc(schema.memberships.createdAt),
              asc(schema.memberships.userId),
            )
            .get();
      if (!successor) {
        deleteSpace(db, space.id);
        continue;
      }
      db.update(schema.memberships)
        .set({ role: 'owner' })
        .where(
          and(
            eq(schema.memberships.spaceId, space.id),
            eq(schema.memberships.userId, successor.userId),
          ),
        )
        .run();
    }
  }

  private find(id: string) {
    const row = this.database.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .get();
    if (!row) throw new NotFoundException('There is no such user');
    return row;
  }

  private assertOtherAdmin(id: string): void {
    const other = this.database.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.isAdmin, true), ne(schema.users.id, id)))
      .get();
    if (!other) throw new ConflictException('There must be at least one admin');
  }
}
