import { hashPassword, verifyPassword } from './password';

describe('passwords', () => {
  it('verifies the password it hashed', async () => {
    const hash = await hashPassword('correct horse');

    expect(hash.startsWith('argon2id$')).toBe(true);
    expect(hash).not.toContain('correct horse');
    expect(await verifyPassword('correct horse', hash)).toBe(true);
  });

  it('rejects a different password', async () => {
    const hash = await hashPassword('correct horse');

    expect(await verifyPassword('Correct horse', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('handles unicode passwords', async () => {
    const hash = await hashPassword('pässwörd-日本語');

    expect(await verifyPassword('pässwörd-日本語', hash)).toBe(true);
  });

  it.each([
    '',
    'plain',
    'argon2id$1$2$3',
    'bcrypt$a$b$c$d$e',
    'argon2id$x$y$z$AA$AA',
  ])('treats the malformed hash %j as a mismatch', async (stored) => {
    expect(await verifyPassword('anything', stored)).toBe(false);
  });
});
