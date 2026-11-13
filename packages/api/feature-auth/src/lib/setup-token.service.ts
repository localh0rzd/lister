import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { AuthService } from './auth.service';

const MIN_FIXED_TOKEN_LENGTH = 16;

/**
 * While no account exists, the server logs a one-time setup token at startup. Presenting it to
 * `POST /api/auth/setup` creates the first account (design §2.3). It lives in memory only, so
 * a restart logs a new one.
 *
 * `LISTER_SETUP_TOKEN` (at least 16 characters) fixes the token instead, for automated setups
 * such as the e2e suites, which can't read the log; it is never logged. Leave it unset in
 * production.
 */
@Injectable()
export class SetupTokenService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SetupTokenService.name);
  private token: string | null = null;

  constructor(private readonly auth: AuthService) {}

  onApplicationBootstrap(): void {
    this.auth.purgeExpiredSessions();
    if (this.auth.userCount() > 0) return;
    const fixed = process.env['LISTER_SETUP_TOKEN'];
    if (fixed !== undefined && fixed.length >= MIN_FIXED_TOKEN_LENGTH) {
      this.token = fixed;
      this.logger.warn(
        'No account exists yet. Setup is open with the token from LISTER_SETUP_TOKEN.',
      );
      return;
    }
    if (fixed) {
      this.logger.warn(
        `Ignoring LISTER_SETUP_TOKEN: it must have at least ${MIN_FIXED_TOKEN_LENGTH} characters.`,
      );
    }
    this.token = randomBytes(24).toString('base64url');
    this.logger.warn(
      `No account exists yet. To create the first admin, open the app and use this setup token: ${this.token}`,
    );
  }

  /** True while setup is possible: no account exists and a token was issued. */
  isOpen(): boolean {
    return this.token !== null && this.auth.userCount() === 0;
  }

  /** Compares in constant time. */
  matches(candidate: string): boolean {
    if (this.token === null) return false;
    const a = Buffer.from(candidate);
    const b = Buffer.from(this.token);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** Forgets the token once it has been used. */
  consume(): void {
    this.token = null;
  }
}
