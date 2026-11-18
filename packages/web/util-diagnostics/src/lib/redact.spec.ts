import { pathOf, scrub, scrubData } from './redact';

describe('scrub', () => {
  it.each([
    ['“Milk” is already included', '“…” is already included'],
    ['bad "token" here', 'bad “…” here'],
    ['two “a” and “b”', 'two “…” and “…”'],
    ['plain reason', 'plain reason'],
    ['line\nbreak', 'line break'],
  ])('turns %j into %j', (input, expected) => {
    expect(scrub(input)).toBe(expected);
  });

  it('shortens long text', () => {
    expect(scrub('x'.repeat(500))).toHaveLength(201);
  });
});

describe('scrubData', () => {
  it('scrubs strings, keeps other values and drops undefined', () => {
    expect(
      scrubData({
        reason: '“Eggs” missing',
        n: 3,
        ok: false,
        none: null,
        gone: undefined,
      }),
    ).toEqual({ reason: '“…” missing', n: 3, ok: false, none: null });
  });

  it('gives nothing for no data', () => {
    expect(scrubData(undefined)).toBeUndefined();
  });
});

describe('pathOf', () => {
  it.each([
    ['/api/auth/me', '/api/auth/me'],
    ['/api/auth/me?token=secret#x', '/api/auth/me'],
    ['https://lister.example.org/api/health?a=1', '/api/health'],
  ])('reduces %s to %s', (url, path) => {
    expect(pathOf(url)).toBe(path);
  });
});
