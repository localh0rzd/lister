import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { and, eq, gt, inArray, lt, ne, sql } from 'drizzle-orm';
import {
  DatabaseConnection,
  findUserByUsername,
  insertSpace,
  schema,
} from '@lister/api/data-access-db';
import type { CurrentUser } from '@lister/shared/api-contracts';
import { newId } from '@lister/shared/domain';
import { AccountEvents } from './account-events';
import { AUTH_CLOCK, type Clock } from './clock';
import { hashPassword, verifyPassword } from './password';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Sessions last 90 days and renew on use (design D15). */
export const SESSION_LIFETIME_MS = 90 * DAY_MS;
/** Renewing writes to the database, so it happens at most this often per session. */
export const SESSION_RENEW_AFTER_MS = 60 * 60 * 1000;

type UserRow = typeof schema.users.$inferSelect;

export interface SignedIn {
  user: CurrentUser;
  /** The cookie value; only its hash is stored. */
  token: string;
  expiresAt: number;
}

export interface NewUser {
  username: string;
  displayName: string;
  password: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
}

export function toCurrentUser(row: UserRow): CurrentUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    isAdmin: row.isAdmin,
    mustChangePassword: row.mustChangePassword,
    visibleToOthers: row.visibleToOthers,
  };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Accounts and sessions. */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private dummyHash?: Promise<string>;

  constructor(
    private readonly database: DatabaseConnection,
    @Inject(AUTH_CLOCK) private readonly clock: Clock,
    private readonly events: AccountEvents = new AccountEvents(),
  ) {
    // Built up front, so the first unknown-user sign-in isn't slower than the rest.
    void this.getDummyHash();
  }

  userCount(): number {
    return (
      this.database.db
        .select({ count: sql<number>`count(*)` })
        .from(schema.users)
        .get()?.count ?? 0
    );
  }

  /** Creates an account. A taken username (ignoring case) is a 409. */
  async createUser(input: NewUser): Promise<CurrentUser> {
    const passwordHash = await hashPassword(input.password);
    return this.insertUser(input, passwordHash);
  }

  /**
   * A regular account for someone with a registration token (D23). `claimToken` runs inside the
   * insert's transaction, before the username check, and throws when the token is no good; a
   * taken username then rolls the claim back, so the token survives.
   */
  async registerUser(
    input: Pick<NewUser, 'username' | 'displayName' | 'password'>,
    claimToken: () => void,
  ): Promise<CurrentUser> {
    const passwordHash = await hashPassword(input.password);
    return this.insertUser(
      { ...input, isAdmin: false, mustChangePassword: false },
      passwordHash,
      false,
      claimToken,
    );
  }

  /**
   * The same as `createUser`, but only while no account exists, checked in the same synchronous
   * step as the insert, so two setups can't both win.
   */
  async createFirstAdmin(
    input: Omit<NewUser, 'isAdmin' | 'mustChangePassword'>,
  ) {
    const passwordHash = await hashPassword(input.password);
    return this.insertUser(
      { ...input, isAdmin: true, mustChangePassword: false },
      passwordHash,
      true,
    );
  }

  /** Checks the credentials and starts a session. The same 401 for an unknown user and a wrong password. */
  async login(username: string, password: string): Promise<SignedIn> {
    const row = this.findByUsername(username);
    // Unknown users cost the same time as known ones, so the response doesn't tell them apart.
    const stored = row?.passwordHash ?? (await this.getDummyHash());
    const matches = await verifyPassword(password, stored);
    if (!row || !matches) {
      this.logger.debug('Sign-in refused: wrong username or password');
      throw new UnauthorizedException('Wrong username or password');
    }
    return this.startSession(row);
  }

  startSession(row: UserRow): SignedIn {
    // Abandoned sessions go as people sign in; one cheap delete per sign-in.
    this.purgeExpiredSessions();
    const now = this.clock();
    const token = randomBytes(32).toString('base64url');
    const expiresAt = now + SESSION_LIFETIME_MS;
    this.database.db
      .insert(schema.sessions)
      .values({
        id: hashToken(token),
        userId: row.id,
        expiresAt,
        createdAt: now,
      })
      .run();
    this.logger.debug(`Sign-in: user ${row.id}, session until ${expiresAt}`);
    return { user: toCurrentUser(row), token, expiresAt };
  }

  /**
   * The user a session cookie belongs to, or null (unknown, or expired, which also deletes it).
   * `renewedUntil` is set when the session was extended, so the cookie can be renewed too.
   */
  authenticate(
    token: string,
  ): { user: CurrentUser; sessionId: string; renewedUntil?: number } | null {
    const sessionId = hashToken(token);
    const found = this.database.db
      .select({ session: schema.sessions, user: schema.users })
      .from(schema.sessions)
      .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
      .where(eq(schema.sessions.id, sessionId))
      .get();
    if (!found) return null;
    const now = this.clock();
    if (found.session.expiresAt <= now) {
      this.database.db
        .delete(schema.sessions)
        .where(eq(schema.sessions.id, sessionId))
        .run();
      this.logger.debug(`Session expired: user ${found.user.id}`);
      return null;
    }
    const user = toCurrentUser(found.user);
    const renewedUntil = now + SESSION_LIFETIME_MS;
    if (renewedUntil - found.session.expiresAt < SESSION_RENEW_AFTER_MS) {
      return { user, sessionId };
    }
    this.database.db
      .update(schema.sessions)
      .set({ expiresAt: renewedUntil })
      .where(eq(schema.sessions.id, sessionId))
      .run();
    return { user, sessionId, renewedUntil };
  }

  /**
   * Whether the session (by id, as in `authenticate()`) still exists and hasn't expired. Long-lived
   * connections (the sync socket) check it on every message. Read-only: it doesn't renew the
   * session.
   */
  isSessionActive(sessionId: string): boolean {
    return this.activeSessions([sessionId]).has(sessionId);
  }

  /** Which of these sessions still exist and haven't expired (one query; read-only). */
  activeSessions(sessionIds: readonly string[]): Set<string> {
    if (sessionIds.length === 0) return new Set();
    return new Set(
      this.database.db
        .select({ id: schema.sessions.id })
        .from(schema.sessions)
        .where(
          and(
            inArray(schema.sessions.id, [...sessionIds]),
            gt(schema.sessions.expiresAt, this.clock()),
          ),
        )
        .all()
        .map((row) => row.id),
    );
  }

  /**
   * Ends one session; unknown ids are fine. Announces it (`AccountEvents`), so a sync socket on
   * that session ends at once.
   */
  endSession(sessionId: string): void {
    const ended = this.database.db
      .delete(schema.sessions)
      .where(eq(schema.sessions.id, sessionId))
      .returning({ userId: schema.sessions.userId })
      .get();
    if (ended) {
      this.logger.debug(`Sign-out: user ${ended.userId}`);
      this.events.emit({ kind: 'sessionsEnded', userId: ended.userId });
    }
  }

  /** Ends all of a user's sessions, except `keepSessionId`, and announces it like `endSession`. */
  endSessionsOf(userId: string, keepSessionId?: string): void {
    this.database.db
      .delete(schema.sessions)
      .where(
        keepSessionId
          ? and(
              eq(schema.sessions.userId, userId),
              ne(schema.sessions.id, keepSessionId),
            )
          : eq(schema.sessions.userId, userId),
      )
      .run();
    this.events.emit({ kind: 'sessionsEnded', userId });
  }

  /**
   * Revokes everything that signs the user in without the password: all their sessions (announced
   * like `endSessionsOf`) and all their passkeys. Part of every reset to a temporary password
   * (D9), so a passkey that someone else added can't outlast the reset. Call it inside the
   * transaction that sets the temporary password.
   */
  revokeSignInsOf(userId: string): void {
    this.database.db
      .delete(schema.passkeys)
      .where(eq(schema.passkeys.userId, userId))
      .run();
    this.endSessionsOf(userId);
  }

  /** Deletes expired sessions. */
  purgeExpiredSessions(): number {
    return this.database.db
      .delete(schema.sessions)
      .where(lt(schema.sessions.expiresAt, this.clock()))
      .run().changes;
  }

  /**
   * Changes a user's own password (after checking the current one), clears the forced-change flag
   * and signs out their other sessions.
   */
  async changePassword(
    userId: string,
    sessionId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<CurrentUser> {
    const row = this.database.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .get();
    if (!row || !(await verifyPassword(currentPassword, row.passwordHash))) {
      // 400, not 401: the session is fine, and 401 means "signed out" to the client.
      throw new BadRequestException('The current password is wrong');
    }
    const passwordHash = await hashPassword(newPassword);
    this.database.sqlite.transaction(() => {
      this.database.db
        .update(schema.users)
        .set({ passwordHash, mustChangePassword: false })
        .where(eq(schema.users.id, userId))
        .run();
      this.endSessionsOf(userId, sessionId);
    })();
    return toCurrentUser({ ...row, mustChangePassword: false });
  }

  /**
   * Sets a new password that must be changed at the next sign-in, and ends the user's sessions
   * and removes their passkeys (`revokeSignInsOf`).
   * Returns the stored username, or null when the username is unknown. Used by the reset command.
   */
  async setTemporaryPassword(
    username: string,
    temporaryPassword: string,
  ): Promise<string | null> {
    const row = this.findByUsername(username);
    if (!row) return null;
    const passwordHash = await hashPassword(temporaryPassword);
    this.database.sqlite.transaction(() => {
      this.database.db
        .update(schema.users)
        .set({ passwordHash, mustChangePassword: true })
        .where(eq(schema.users.id, row.id))
        .run();
      this.revokeSignInsOf(row.id);
    })();
    return row.username;
  }

  findByUsername(username: string): UserRow | undefined {
    return findUserByUsername(this.database.db, username);
  }

  private insertUser(
    input: NewUser,
    passwordHash: string,
    onlyIfEmpty = false,
    beforeInsert?: () => void,
  ): CurrentUser {
    const insert = this.database.sqlite.transaction(() => {
      beforeInsert?.();
      if (onlyIfEmpty && this.userCount() > 0) {
        throw new ConflictException('Setup has already been done');
      }
      if (this.findByUsername(input.username)) {
        throw new ConflictException('That username is taken');
      }
      const now = this.clock();
      const row = this.database.db
        .insert(schema.users)
        .values({
          id: newId(),
          username: input.username.trim(),
          displayName: input.displayName.trim(),
          passwordHash,
          isAdmin: input.isAdmin,
          mustChangePassword: input.mustChangePassword,
          createdAt: now,
        })
        .returning()
        .get();
      // Every account has its personal space (D14).
      insertSpace(this.database.db, {
        name: row.displayName,
        ownerId: row.id,
        personal: true,
        now,
      });
      return row;
    });
    return toCurrentUser(insert());
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
    return this.dummyHash;
  }
}
