import {
  USERNAME_PATTERN,
  isRegistrationToken,
  normalizeRegistrationToken,
  registrationLink,
} from './auth';

describe('USERNAME_PATTERN', () => {
  it.each(['anna', 'Anna', 'anna.b', 'a_b-c', 'user42', '.'])(
    'accepts %j',
    (username) => {
      expect(USERNAME_PATTERN.test(username)).toBe(true);
    },
  );

  it.each(['', 'Ärger', 'josé', 'é', 'no spaces', 'a@b', 'ａnna'])(
    'refuses %j',
    (username) => {
      expect(USERNAME_PATTERN.test(username)).toBe(false);
    },
  );
});

describe('registration tokens', () => {
  it.each([
    ['abcd1234wxyz', 'ABCD1234WXYZ'],
    ['  ABCD1234WXYZ \n', 'ABCD1234WXYZ'],
    ['', ''],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeRegistrationToken(input)).toBe(expected);
  });

  it.each(['ABCD1234WXYZ', ' abcd1234wxyz ', '000000000000'])(
    'recognizes %j as a token',
    (input) => {
      expect(isRegistrationToken(input)).toBe(true);
    },
  );

  it.each(['', 'SHORT', 'ABCD1234WXYZ1', 'ABCD-234WXYZ', 'ÄBCD1234WXYZ'])(
    'does not recognize %j as a token',
    (input) => {
      expect(isRegistrationToken(input)).toBe(false);
    },
  );

  it('builds the link from an origin, with or without a trailing slash', () => {
    expect(registrationLink('https://lister.example', 'ABC123')).toBe(
      'https://lister.example/register?token=ABC123',
    );
    expect(registrationLink('http://localhost:4200/', 'ABC123')).toBe(
      'http://localhost:4200/register?token=ABC123',
    );
  });
});
