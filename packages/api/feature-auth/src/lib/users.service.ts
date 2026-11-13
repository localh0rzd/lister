import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { DatabaseConnection, schema } from '@lister/api/data-access-db';
import type {
  CurrentUser,
  UpdateUserRequest,
} from '@lister/shared/api-contracts';
import { AuthService, toCurrentUser } from './auth.service';
import { hashPassword } from './password';

/** User administration (design §2.3). Every method is for admins; the controller enforces it. */
@Injectable()
export class UsersService {
  constructor(
    private readonly database: DatabaseConnection,
    private readonly auth: AuthService,
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
    return this.database.sqlite.transaction(() => {
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
  }

  /** Deletes a user and their sessions. The last admin can't be deleted (409). */
  remove(id: string): void {
    this.database.sqlite.transaction(() => {
      const row = this.find(id);
      if (row.isAdmin) this.assertOtherAdmin(id);
      // Sessions go with the user (`on delete cascade`).
      this.database.db
        .delete(schema.users)
        .where(eq(schema.users.id, id))
        .run();
    })();
  }

  /** Sets a temporary password, which must be changed at the next sign-in, and ends the sessions. */
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
      this.auth.endSessionsOf(id);
    })();
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
