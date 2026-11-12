import { USERNAME_PATTERN } from './auth';

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
