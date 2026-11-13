import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { DatabaseConnection, schema } from '@lister/api/data-access-db';
import type { PasskeyInfo, WebAuthnJson } from '@lister/shared/api-contracts';
import { AuthService, type SignedIn } from './auth.service';
import { ChallengeStore } from './challenge-store';
import { AUTH_CLOCK, type Clock } from './clock';
import { webAuthnConfig } from './webauthn-config';

type PasskeyRow = typeof schema.passkeys.$inferSelect;

const toInfo = (row: PasskeyRow): PasskeyInfo => ({
  id: row.id,
  name: row.name,
  createdAt: new Date(row.createdAt).toISOString(),
  lastUsedAt:
    row.lastUsedAt === null ? null : new Date(row.lastUsedAt).toISOString(),
});

function parseTransports(stored: string): AuthenticatorTransport[] {
  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed)
      ? (parsed.filter(
          (t) => typeof t === 'string',
        ) as AuthenticatorTransport[])
      : [];
  } catch {
    return [];
  }
}

/** The challenge a sign-in response answers, read from its `clientDataJSON`. */
function challengeOf(response: WebAuthnJson): string | undefined {
  const inner = response['response'];
  const data =
    typeof inner === 'object' && inner !== null
      ? (inner as Record<string, unknown>)['clientDataJSON']
      : undefined;
  if (typeof data !== 'string') return undefined;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(data, 'base64url').toString('utf8'),
    );
    const challenge = (parsed as { challenge?: unknown } | null)?.challenge;
    return typeof challenge === 'string' ? challenge : undefined;
  } catch {
    return undefined;
  }
}

/** Passkeys: adding, listing, removing, and signing in with one (WebAuthn, design §2.3). */
@Injectable()
export class PasskeysService {
  /** Separate stores, so the anonymous sign-in requests can never push out a user's registration. */
  private readonly registrations = new ChallengeStore();
  private readonly signIns = new ChallengeStore();

  constructor(
    private readonly database: DatabaseConnection,
    private readonly auth: AuthService,
    @Inject(AUTH_CLOCK) private readonly clock: Clock,
  ) {}

  list(userId: string): PasskeyInfo[] {
    return this.database.db
      .select()
      .from(schema.passkeys)
      .where(eq(schema.passkeys.userId, userId))
      .orderBy(schema.passkeys.createdAt)
      .all()
      .map(toInfo);
  }

  /** Options for `startRegistration()`; a discoverable credential, so no username is needed later. */
  async registrationOptions(user: {
    id: string;
    username: string;
    displayName: string;
  }): Promise<WebAuthnJson> {
    const { rpID, rpName } = webAuthnConfig(process.env);
    const existing = this.database.db
      .select()
      .from(schema.passkeys)
      .where(eq(schema.passkeys.userId, user.id))
      .all();
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: user.username,
      userDisplayName: user.displayName,
      userID: new TextEncoder().encode(user.id),
      attestationType: 'none',
      excludeCredentials: existing.map((row) => ({
        id: row.id,
        transports: parseTransports(row.transports),
      })),
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
      },
    });
    this.registrations.issue(options.challenge, user.id, user.id, this.clock());
    return options as unknown as WebAuthnJson;
  }

  /** Verifies the browser's answer and stores the passkey. */
  async add(
    userId: string,
    name: string,
    response: WebAuthnJson,
  ): Promise<PasskeyInfo> {
    const { rpID, origins } = webAuthnConfig(process.env);
    const challenge = challengeOf(response);
    if (
      challenge === undefined ||
      !this.registrations.consume(challenge, userId, this.clock())
    ) {
      throw new BadRequestException(
        'The passkey request expired. Start again.',
      );
    }
    let verified;
    try {
      verified = await verifyRegistrationResponse({
        response: response as unknown as RegistrationResponseJSON,
        expectedChallenge: challenge,
        expectedOrigin: origins,
        expectedRPID: rpID,
        requireUserVerification: true,
      });
    } catch {
      throw new BadRequestException('The passkey could not be verified');
    }
    if (!verified.verified) {
      throw new BadRequestException('The passkey could not be verified');
    }
    const { credential } = verified.registrationInfo;
    const taken = this.database.db
      .select({ id: schema.passkeys.id })
      .from(schema.passkeys)
      .where(eq(schema.passkeys.id, credential.id))
      .get();
    if (taken) throw new ConflictException('That passkey is already added');
    const row = this.database.db
      .insert(schema.passkeys)
      .values({
        id: credential.id,
        userId,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: JSON.stringify(credential.transports ?? []),
        name,
        createdAt: this.clock(),
      })
      .returning()
      .get();
    return toInfo(row);
  }

  /** Removes one of the user's own passkeys; anyone else's is a 404, as an unknown id is. */
  remove(userId: string, passkeyId: string): void {
    const removed = this.database.db
      .delete(schema.passkeys)
      .where(
        and(
          eq(schema.passkeys.id, passkeyId),
          eq(schema.passkeys.userId, userId),
        ),
      )
      .run().changes;
    if (removed === 0)
      throw new NotFoundException('That passkey does not exist');
  }

  /**
   * Options for `startAuthentication()` without naming a user (discoverable credentials).
   * `client` (see `clientKey()`) caps how many sign-in challenges one client keeps waiting.
   */
  async authenticationOptions(client: string): Promise<WebAuthnJson> {
    const { rpID } = webAuthnConfig(process.env);
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'required',
    });
    this.signIns.issue(options.challenge, undefined, client, this.clock());
    return options as unknown as WebAuthnJson;
  }

  /**
   * Checks the browser's answer and starts a session, the same as a password sign-in. Every
   * failure is the same 401, whichever check refused.
   */
  async signIn(response: WebAuthnJson): Promise<SignedIn> {
    const refused = () => new UnauthorizedException('Passkey sign-in failed');
    const { rpID, origins } = webAuthnConfig(process.env);
    const challenge = challengeOf(response);
    if (
      challenge === undefined ||
      !this.signIns.consume(challenge, undefined, this.clock())
    ) {
      throw refused();
    }
    const id = response['id'];
    if (typeof id !== 'string') throw refused();
    const found = this.database.db
      .select({ passkey: schema.passkeys, user: schema.users })
      .from(schema.passkeys)
      .innerJoin(schema.users, eq(schema.users.id, schema.passkeys.userId))
      .where(eq(schema.passkeys.id, id))
      .get();
    if (!found) throw refused();
    // The authenticator reports which user the credential was made for; it must be this one.
    const inner = response['response'] as Record<string, unknown> | undefined;
    const handle = inner?.['userHandle'];
    if (
      typeof handle === 'string' &&
      Buffer.from(handle, 'base64url').toString('utf8') !== found.user.id
    ) {
      throw refused();
    }
    let verified;
    try {
      verified = await verifyAuthenticationResponse({
        response: response as unknown as AuthenticationResponseJSON,
        expectedChallenge: challenge,
        expectedOrigin: origins,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: {
          id: found.passkey.id,
          publicKey: new Uint8Array(found.passkey.publicKey),
          counter: found.passkey.counter,
          transports: parseTransports(found.passkey.transports),
        },
      });
    } catch {
      throw refused();
    }
    if (!verified.verified) throw refused();
    this.database.db
      .update(schema.passkeys)
      .set({
        counter: verified.authenticationInfo.newCounter,
        lastUsedAt: this.clock(),
      })
      .where(eq(schema.passkeys.id, found.passkey.id))
      .run();
    return this.auth.startSession(found.user);
  }
}
