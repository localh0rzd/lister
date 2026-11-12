import { readSessionToken, sessionCookieOptions } from './http';

describe('session cookie', () => {
  it.each([
    [undefined, undefined],
    ['', undefined],
    ['other=1', undefined],
    ['lister_session=abc', 'abc'],
    ['a=1; lister_session=abc; b=2', 'abc'],
    ['xlister_session=nope', undefined],
    ['lister_session=', undefined],
  ])('reads the token from %j', (header, token) => {
    expect(readSessionToken(header)).toBe(token);
  });

  it('is Secure only for an https public URL', () => {
    expect(
      sessionCookieOptions({ PUBLIC_URL: 'https://lister.example.org' }).secure,
    ).toBe(true);
    expect(
      sessionCookieOptions({ PUBLIC_URL: 'http://localhost:4200' }).secure,
    ).toBe(false);
    expect(sessionCookieOptions({}).secure).toBe(false);
  });

  it('is httpOnly and SameSite=Lax', () => {
    expect(sessionCookieOptions({})).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
    });
  });
});
