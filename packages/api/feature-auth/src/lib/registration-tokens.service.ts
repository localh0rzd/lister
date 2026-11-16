import { randomInt } from 'node:crypto';
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gt } from 'drizzle-orm';
import { DatabaseConnection, schema } from '@lister/api/data-access-db';
import {
  REGISTRATION_TOKEN_LENGTH,
  REGISTRATION_TOKEN_LIFETIME_DAYS,
  type RegistrationToken,
  isRegistrationToken,
  normalizeRegistrationToken,
} from '@lister/shared/api-contracts';
import { AUTH_CLOCK, type Clock } from './clock';

export const REGISTRATION_TOKEN_LIFETIME_MS =
  REGISTRATION_TOKEN_LIFETIME_DAYS * 24 * 60 * 60 * 1000;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** The one error for a wrong, used, removed or expired token, so none of them can be told apart. */
export const INVALID_TOKEN_MESSAGE =
  'This registration link is not valid. It may have been used, removed or expired.';

/**
 * A fresh token: 12 characters A–Z and 0–9, each drawn with `randomInt`, which is uniform
 * (no modulo bias) and cryptographically secure.
 */
export function generateRegistrationToken(
  pick: (max: number) => number = randomInt,
): string {
  let token = '';
  for (let i = 0; i < REGISTRATION_TOKEN_LENGTH; i++) {
    token += ALPHABET[pick(ALPHABET.length)];
  }
  return token;
}

/** The registration tokens admins hand out (design D23). */
@Injectable()
export class RegistrationTokensService {
  constructor(
    private readonly database: DatabaseConnection,
    @Inject(AUTH_CLOCK) private readonly clock: Clock,
  ) {}

  create(adminId: string): RegistrationToken {
    const now = this.clock();
    const row = this.database.db
      .insert(schema.registrationTokens)
      .values({
        token: generateRegistrationToken(),
        createdBy: adminId,
        createdAt: now,
        expiresAt: now + REGISTRATION_TOKEN_LIFETIME_MS,
      })
      .returning()
      .get();
    return toDto(row, this.creatorName(adminId));
  }

  /** Unused, unexpired tokens, newest first. */
  list(): RegistrationToken[] {
    return this.database.db
      .select({
        row: schema.registrationTokens,
        createdBy: schema.users.displayName,
      })
      .from(schema.registrationTokens)
      .innerJoin(
        schema.users,
        eq(schema.users.id, schema.registrationTokens.createdBy),
      )
      .where(gt(schema.registrationTokens.expiresAt, this.clock()))
      .orderBy(desc(schema.registrationTokens.createdAt))
      .all()
      .map(({ row, createdBy }) => toDto(row, createdBy));
  }

  /** Removes a token (it stops working at once); an unknown one is a 404. */
  remove(token: string): void {
    const removed = this.database.db
      .delete(schema.registrationTokens)
      .where(
        eq(schema.registrationTokens.token, normalizeRegistrationToken(token)),
      )
      .run().changes;
    if (removed === 0) throw new NotFoundException('That token does not exist');
  }

  /** Whether the token exists and hasn't expired; the form's token is accepted ignoring case. */
  isValid(input: string): boolean {
    return (
      isRegistrationToken(input) &&
      this.database.db
        .select({ token: schema.registrationTokens.token })
        .from(schema.registrationTokens)
        .where(this.unexpired(input))
        .get() !== undefined
    );
  }

  /**
   * Uses the token up: deletes it, or throws 403 when it doesn't exist (any more) or has
   * expired. Synchronous, to run inside the transaction that creates the account, so the
   * delete and the insert stand or fall together and two registrations can't share a token.
   */
  claim(input: string): void {
    const claimed = isRegistrationToken(input)
      ? this.database.db
          .delete(schema.registrationTokens)
          .where(this.unexpired(input))
          .run().changes
      : 0;
    if (claimed === 0) throw new ForbiddenException(INVALID_TOKEN_MESSAGE);
  }

  /** Matches the token (ignoring case) only while it hasn't expired. */
  private unexpired(input: string) {
    return and(
      eq(schema.registrationTokens.token, normalizeRegistrationToken(input)),
      gt(schema.registrationTokens.expiresAt, this.clock()),
    );
  }

  private creatorName(userId: string): string {
    return (
      this.database.db
        .select({ displayName: schema.users.displayName })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .get()?.displayName ?? ''
    );
  }
}

function toDto(
  row: typeof schema.registrationTokens.$inferSelect,
  createdBy: string,
): RegistrationToken {
  return {
    token: row.token,
    createdAt: new Date(row.createdAt).toISOString(),
    createdBy,
    expiresAt: new Date(row.expiresAt).toISOString(),
  };
}
