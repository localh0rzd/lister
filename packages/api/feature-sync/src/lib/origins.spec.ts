import { DEV_WEB_ORIGIN, allowedOrigins } from './origins';

describe('allowedOrigins', () => {
  it('allows the dev server in development', () => {
    expect(allowedOrigins({})).toEqual([DEV_WEB_ORIGIN]);
  });

  it('uses the origin of PUBLIC_URL, plus the dev server outside production', () => {
    expect(
      allowedOrigins({ PUBLIC_URL: 'https://lister.example.com/app/' }),
    ).toEqual(['https://lister.example.com', DEV_WEB_ORIGIN]);
  });

  it('allows only PUBLIC_URL in production', () => {
    expect(
      allowedOrigins({
        NODE_ENV: 'production',
        PUBLIC_URL: 'https://lister.example.com',
      }),
    ).toEqual(['https://lister.example.com']);
  });

  it('refuses to start in production without a valid PUBLIC_URL', () => {
    expect(() => allowedOrigins({ NODE_ENV: 'production' })).toThrow(
      /PUBLIC_URL must be set/,
    );
    expect(() =>
      allowedOrigins({ NODE_ENV: 'production', PUBLIC_URL: ' ' }),
    ).toThrow();
    expect(() => allowedOrigins({ PUBLIC_URL: 'not a url' })).toThrow(
      /not a URL/,
    );
    expect(() => allowedOrigins({ PUBLIC_URL: 'file:///srv/lister' })).toThrow(
      /http\(s\)/,
    );
  });
});
