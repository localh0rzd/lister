import { AttemptLimiter, clientKey } from './rate-limiter';

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

  it('forgets one failure that turned out to be a success', () => {
    const limiter = new AttemptLimiter(2, 1000);
    limiter.recordFailure('a', 5);
    limiter.recordFailure('a', 5);
    limiter.forget('a', 5);

    expect(limiter.retryAfterMs('a', 6)).toBe(0);
    limiter.forget('a', 5);
    limiter.forget('a', 5);
    limiter.forget('b', 5);
    limiter.recordFailure('a', 7);

    expect(limiter.retryAfterMs('a', 8)).toBe(0);
  });
});

describe('clientKey', () => {
  it.each([
    ['203.0.113.7', '203.0.113.7'],
    ['::ffff:203.0.113.7', '203.0.113.7'],
    ['::ffff:cb00:7107', '203.0.113.7'],
    ['2001:db8:1:2:aaaa:bbbb:cccc:dddd', '2001:db8:1:2::/64'],
    ['2001:DB8:1:2::1', '2001:db8:1:2::/64'],
    ['2001:0db8:0001:0002:0:0:0:9', '2001:db8:1:2::/64'],
    ['2001:db8::1', '2001:db8:0:0::/64'],
    ['fe80::1%eth0', 'fe80:0:0:0::/64'],
    ['::1', '0:0:0:0::/64'],
    [undefined, 'unknown'],
    ['', 'unknown'],
  ])('keys %j as %j', (ip, key) => {
    expect(clientKey(ip)).toBe(key);
  });
});
