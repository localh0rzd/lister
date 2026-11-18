import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseConnection, schema } from '@lister/api/data-access-db';
import {
  USER_SEARCH,
  type UserSearchQuery,
  type UserSuggestion,
} from '@lister/shared/api-contracts';
import { AUTH_CLOCK, type Clock } from './clock';
import type { AuthResponse } from './http';
import { AttemptLimiter } from './rate-limiter';

export const MAX_SEARCHES = 60;
export const SEARCH_WINDOW_MS = 60 * 1000;

/** Lower case without accents, so "José" is found by "jose". */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Finds the users who chose to be found (design D27). */
@Injectable()
export class UserSearchService {
  private readonly limiter = new AttemptLimiter(MAX_SEARCHES, SEARCH_WINDOW_MS);

  constructor(
    private readonly database: DatabaseConnection,
    @Inject(AUTH_CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Visible users whose username or display name contains the text, at most
   * `USER_SEARCH.limit`, without the caller and without the members of `spaceId`. `spaceId` must
   * be a space of the caller's (404 otherwise), so the search can't tell who is in someone else's
   * space. Each call counts against a per-user limit of `MAX_SEARCHES` a minute, so the list
   * can't be scraped; past it the answer is 429 with `Retry-After`.
   */
  search(
    callerId: string,
    query: UserSearchQuery,
    response: Pick<AuthResponse, 'setHeader'>,
  ): UserSuggestion[] {
    const now = this.clock();
    const waitMs = this.limiter.retryAfterMs(callerId, now);
    if (waitMs > 0) {
      response.setHeader('Retry-After', Math.ceil(waitMs / 1000));
      throw new HttpException(
        'Too many searches. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.limiter.recordFailure(callerId, now);
    this.limiter.prune(now);

    const { q, spaceId } = query;
    const needle = fold(q);
    if (spaceId && !this.isMember(callerId, spaceId)) {
      throw new NotFoundException('There is no such space');
    }
    const members = new Set(
      spaceId
        ? this.database.db
            .select({ userId: schema.memberships.userId })
            .from(schema.memberships)
            .where(eq(schema.memberships.spaceId, spaceId))
            .all()
            .map((row) => row.userId)
        : [],
    );
    const rows = this.database.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.visibleToOthers, true))
      .all();
    return rows
      .filter(
        (row) =>
          row.id !== callerId &&
          !members.has(row.id) &&
          (fold(row.username).includes(needle) ||
            fold(row.displayName).includes(needle)),
      )
      .sort((a, b) => fold(a.displayName).localeCompare(fold(b.displayName)))
      .slice(0, USER_SEARCH.limit)
      .map(({ id, username, displayName }) => ({ id, username, displayName }));
  }

  private isMember(userId: string, spaceId: string): boolean {
    return !!this.database.db
      .select({ userId: schema.memberships.userId })
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.spaceId, spaceId),
          eq(schema.memberships.userId, userId),
        ),
      )
      .get();
  }
}
