/** How long a WebAuthn challenge can be answered. */
export const CHALLENGE_LIFETIME_MS = 5 * 60 * 1000;
/** Challenges for sign-in are issued to anyone, so how many wait at once is capped. */
export const MAX_PENDING_CHALLENGES = 1000;

interface Pending {
  /** Whoever the challenge was issued to; `undefined` for sign-in, which names nobody yet. */
  owner: string | undefined;
  expiresAt: number;
}

/**
 * WebAuthn challenges the server issued and is waiting to see signed: single use (`consume()`
 * removes it, whether or not the answer turns out valid) and short-lived. Kept in memory: the app
 * runs as one process, and a restart only costs the person an extra tap.
 */
export class ChallengeStore {
  private readonly pending = new Map<string, Pending>();

  constructor(private readonly lifetimeMs = CHALLENGE_LIFETIME_MS) {}

  issue(challenge: string, owner: string | undefined, now: number): void {
    this.prune(now);
    // Map keeps insertion order, so the first key is the oldest.
    while (this.pending.size >= MAX_PENDING_CHALLENGES) {
      const oldest = this.pending.keys().next();
      if (oldest.done) break;
      this.pending.delete(oldest.value);
    }
    this.pending.set(challenge, { owner, expiresAt: now + this.lifetimeMs });
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
