import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AUTH_CLOCK, type Clock } from './clock';
import { AttemptLimiter } from './rate-limiter';
import type { AuthResponse } from './http';

export const MAX_FAILED_ATTEMPTS = 10;
export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

/**
 * Per-client-IP limit on failed sign-in and setup attempts: after 10 failures in 15 minutes the
 * address gets 429 (with `Retry-After`) until the oldest failure ages out.
 */
@Injectable()
export class AttemptLimits {
  private readonly limiter = new AttemptLimiter(
    MAX_FAILED_ATTEMPTS,
    ATTEMPT_WINDOW_MS,
  );

  constructor(@Inject(AUTH_CLOCK) private readonly clock: Clock) {}

  /** Throws 429 when `ip` has failed too often. */
  assertAllowed(ip: string | undefined, response: AuthResponse): void {
    const now = this.clock();
    const waitMs = this.limiter.retryAfterMs(ip ?? 'unknown', now);
    if (waitMs > 0) {
      response.setHeader('Retry-After', Math.ceil(waitMs / 1000));
      throw new HttpException(
        'Too many attempts. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  recordFailure(ip: string | undefined): void {
    const now = this.clock();
    this.limiter.recordFailure(ip ?? 'unknown', now);
    this.limiter.prune(now);
  }
}
