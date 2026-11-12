import { isIPv4, isIPv6 } from 'node:net';

/**
 * Counts failed attempts per key (a client, see `clientKey`) in a sliding window and says when a
 * key must wait. In memory: a restart clears it, which is fine for one process (design §4).
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

  /** Takes back one failure recorded at `at` (an attempt that turned out to succeed). */
  forget(key: string, at: number): void {
    const recorded = this.failures.get(key);
    const index = recorded?.indexOf(at) ?? -1;
    if (!recorded || index < 0) return;
    recorded.splice(index, 1);
    if (recorded.length === 0) this.failures.delete(key);
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

/** The eight 16-bit groups of an IPv6 address (an embedded IPv4 tail becomes the last two). */
function ipv6Groups(address: string): number[] {
  const toGroups = (part: string): number[] =>
    part === ''
      ? []
      : part.split(':').flatMap((group) => {
          if (!group.includes('.')) return [parseInt(group, 16)];
          const [a, b, c, d] = group.split('.').map(Number);
          return [(a << 8) | b, (c << 8) | d];
        });
  const [head, tail] = address.split('::');
  if (tail === undefined) return toGroups(head);
  const headGroups = toGroups(head);
  const tailGroups = toGroups(tail);
  const zeros = 8 - headGroups.length - tailGroups.length;
  return [...headGroups, ...new Array<number>(zeros).fill(0), ...tailGroups];
}

/**
 * The rate-limit key for a client address. An IPv6 client usually controls a whole /64, so it is
 * keyed by that prefix; an IPv4-mapped IPv6 address (`::ffff:203.0.113.7`) counts as the IPv4
 * address.
 */
export function clientKey(ip: string | undefined): string {
  const address = (ip ?? '').split('%')[0].toLowerCase();
  if (!address) return 'unknown';
  if (isIPv4(address) || !isIPv6(address)) return address;
  const groups = ipv6Groups(address);
  if (
    groups.slice(0, 5).every((group) => group === 0) &&
    groups[5] === 0xffff
  ) {
    return [
      groups[6] >> 8,
      groups[6] & 0xff,
      groups[7] >> 8,
      groups[7] & 0xff,
    ].join('.');
  }
  return `${groups
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(':')}::/64`;
}
