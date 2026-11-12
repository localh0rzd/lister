import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AUTH_CLOCK, type Clock } from './clock';
import { AttemptLimiter, clientKey } from './rate-limiter';
import type { AuthResponse } from './http';

export const MAX_FAILED_ATTEMPTS = 10;
export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

/** One attempt reserved by `AttemptLimits.begin()`. */
export interface Attempt {
  /** The attempt succeeded (or doesn't count): it is no longer a failure. */
  release(): void;
}

/**
 * Per-client limit on failed sign-in, setup and password-change attempts: after 10 failures in
 * 15 minutes the client (its IP, an IPv6 client's /64) gets 429 (with `Retry-After`) until the
 * oldest failure ages out.
 */
@Injectable()
export class AttemptLimits {
  private readonly limiter = new AttemptLimiter(
    MAX_FAILED_ATTEMPTS,
    ATTEMPT_WINDOW_MS,
  );

  constructor(@Inject(AUTH_CLOCK) private readonly clock: Clock) {}

  /**
   * Starts an attempt: throws 429 when the client has failed too often, otherwise counts the
   * attempt as a failure until it is released. Checking and counting happen in one synchronous
   * step, before the caller awaits the password check, so requests sent in parallel can't all
   * pass the check before any of them has failed.
   */
  begin(ip: string | undefined, response: AuthResponse): Attempt {
    const key = clientKey(ip);
    const now = this.clock();
    const waitMs = this.limiter.retryAfterMs(key, now);
    if (waitMs > 0) {
      response.setHeader('Retry-After', Math.ceil(waitMs / 1000));
      throw new HttpException(
        'Too many attempts. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.limiter.recordFailure(key, now);
    this.limiter.prune(now);
    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        this.limiter.forget(key, now);
      },
    };
  }
}
