/** How long a WebAuthn challenge can be answered. */
export const CHALLENGE_LIFETIME_MS = 5 * 60 * 1000;
/** Challenges for sign-in are issued to anyone, so how many wait at once is capped. */
export const MAX_PENDING_CHALLENGES = 1000;
/**
 * How many challenges one requester (a client address, or a signed-in user) may have waiting.
 * Past it, that requester's own oldest is dropped, so nobody can push out anyone else's.
 */
export const MAX_PENDING_PER_REQUESTER = 10;

interface Pending {
  /** Whoever the challenge was issued to; `undefined` for sign-in, which names nobody yet. */
  owner: string | undefined;
  /** Who asked for it, for the per-requester cap. */
  requester: string;
  expiresAt: number;
}

/**
 * WebAuthn challenges the server issued and is waiting to see signed: single use (`consume()`
 * removes it, whether or not the answer turns out valid) and short-lived. Kept in memory: the app
 * runs as one process, and a restart only costs the person an extra tap.
 *
 * Each requester has at most `MAX_PENDING_PER_REQUESTER` waiting, so one client asking over and
 * over only replaces its own challenges. The overall cap (`MAX_PENDING_CHALLENGES`) only bounds
 * memory: reaching it takes that many different requesters.
 */
export class ChallengeStore {
  private readonly pending = new Map<string, Pending>();

  constructor(private readonly lifetimeMs = CHALLENGE_LIFETIME_MS) {}

  issue(
    challenge: string,
    owner: string | undefined,
    requester: string,
    now: number,
  ): void {
    this.prune(now);
    // Map keeps insertion order, so the first matching key is the oldest.
    const own = [...this.pending]
      .filter(([, found]) => found.requester === requester)
      .map(([key]) => key);
    const excess = own.length - (MAX_PENDING_PER_REQUESTER - 1);
    if (excess > 0) {
      for (const key of own.slice(0, excess)) this.pending.delete(key);
    }
    while (this.pending.size >= MAX_PENDING_CHALLENGES) {
      const oldest = this.pending.keys().next();
      if (oldest.done) break;
      this.pending.delete(oldest.value);
    }
    this.pending.set(challenge, {
      owner,
      requester,
      expiresAt: now + this.lifetimeMs,
    });
  }

  /** True once per issued challenge: it must belong to `owner` and not have expired. */
  consume(challenge: string, owner: string | undefined, now: number): boolean {
    const found = this.pending.get(challenge);
    if (!found) return false;
    this.pending.delete(challenge);
    return found.expiresAt > now && found.owner === owner;
  }

  private prune(now: number): void {
    for (const [challenge, found] of this.pending) {
      if (found.expiresAt <= now) this.pending.delete(challenge);
    }
  }
}
