import { webAuthnConfig } from './webauthn-config';

describe('webAuthnConfig', () => {
  it('takes the relying-party id and origin from PUBLIC_URL', () => {
    expect(
      webAuthnConfig({ PUBLIC_URL: 'https://lister.example.com/app/' }),
    ).toMatchObject({
      rpID: 'lister.example.com',
      origins: ['https://lister.example.com'],
    });
  });

  it('keeps the port out of the id but in the origin', () => {
    expect(
      webAuthnConfig({ PUBLIC_URL: 'http://localhost:3100' }),
    ).toMatchObject({ rpID: 'localhost', origins: ['http://localhost:3100'] });
  });

  it('works on localhost with the dev server when PUBLIC_URL is not set', () => {
    expect(webAuthnConfig({})).toMatchObject({
      rpID: 'localhost',
      origins: ['http://localhost:4200'],
    });
  });

  it('refuses to run in production without a valid PUBLIC_URL', () => {
    expect(() => webAuthnConfig({ NODE_ENV: 'production' })).toThrow(
      /PUBLIC_URL must be set/,
    );
    expect(() => webAuthnConfig({ PUBLIC_URL: 'nonsense' })).toThrow(
      /not a URL/,
    );
    expect(() => webAuthnConfig({ PUBLIC_URL: 'file:///x' })).toThrow(
      /http\(s\)/,
    );
  });
});
