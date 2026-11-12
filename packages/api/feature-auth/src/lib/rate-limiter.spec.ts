import { AttemptLimiter } from './rate-limiter';

describe('AttemptLimiter', () => {
  it('lets a key try until it has failed too often', () => {
    const limiter = new AttemptLimiter(3, 1000);
    for (let i = 0; i < 3; i++) {
      expect(limiter.retryAfterMs('a', i)).toBe(0);
      limiter.recordFailure('a', i);
    }

    expect(limiter.retryAfterMs('a', 3)).toBe(997);
  });

  it('keeps keys apart', () => {
    const limiter = new AttemptLimiter(1, 1000);
    limiter.recordFailure('a', 0);

    expect(limiter.retryAfterMs('a', 1)).toBeGreaterThan(0);
    expect(limiter.retryAfterMs('b', 1)).toBe(0);
  });

  it('forgets failures after the window', () => {
    const limiter = new AttemptLimiter(1, 1000);
    limiter.recordFailure('a', 0);

    expect(limiter.retryAfterMs('a', 1000)).toBe(0);
  });

  it('frees the key as soon as the failure that blocks it ages out', () => {
    const limiter = new AttemptLimiter(2, 1000);
    limiter.recordFailure('a', 0);
    limiter.recordFailure('a', 600);

    expect(limiter.retryAfterMs('a', 700)).toBe(300);
    expect(limiter.retryAfterMs('a', 1000)).toBe(0);
  });

  it('prune drops idle keys', () => {
    const limiter = new AttemptLimiter(1, 1000);
    limiter.recordFailure('a', 0);
    limiter.prune(5000);

    expect(limiter.retryAfterMs('a', 5000)).toBe(0);
  });
});
