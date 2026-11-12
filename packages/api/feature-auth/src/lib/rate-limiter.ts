/**
 * Counts failed attempts per key (a client IP) in a sliding window and says when a key must wait.
 * In memory: a restart clears it, which is fine for one process (design §4).
 */
export class AttemptLimiter {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly maxFailures: number,
    private readonly windowMs: number,
  ) {}

  /** Milliseconds until `key` may try again; 0 when it may try now. */
  retryAfterMs(key: string, now: number): number {
    const recent = this.recent(key, now);
    if (recent.length < this.maxFailures) return 0;
    return recent[recent.length - this.maxFailures] + this.windowMs - now;
  }

  recordFailure(key: string, now: number): void {
    const recent = this.recent(key, now);
    recent.push(now);
    this.failures.set(key, recent);
  }

  /** Forgets keys that have no failures left in the window (call now and then). */
  prune(now: number): void {
    for (const key of [...this.failures.keys()]) this.recent(key, now);
  }

  private recent(key: string, now: number): number[] {
    const kept = (this.failures.get(key) ?? []).filter(
      (at) => at > now - this.windowMs,
    );
    if (kept.length === 0) this.failures.delete(key);
    else this.failures.set(key, kept);
    return kept;
  }
}
