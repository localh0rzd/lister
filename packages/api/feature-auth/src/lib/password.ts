import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';

// OWASP's argon2id minimum: 19 MiB, 2 passes, 1 lane. Stored in the hash, so it can be raised.
const MEMORY_KIB = 19456;
const PASSES = 2;
const PARALLELISM = 1;
const TAG_LENGTH = 32;
const PREFIX = 'argon2id';

function derive(
  password: string,
  salt: Buffer,
  memory: number,
  passes: number,
  parallelism: number,
  tagLength: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2(
      'argon2id',
      {
        message: Buffer.from(password, 'utf8'),
        nonce: salt,
        memory,
        passes,
        parallelism,
        tagLength,
      },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

/** `argon2id$m$t$p$salt$hash` (salt and hash in base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(
    password,
    salt,
    MEMORY_KIB,
    PASSES,
    PARALLELISM,
    TAG_LENGTH,
  );
  return [
    PREFIX,
    MEMORY_KIB,
    PASSES,
    PARALLELISM,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

/** True when `password` matches `stored`; false for a malformed hash. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [prefix, memory, passes, parallelism, salt, hash] = stored.split('$');
  if (prefix !== PREFIX || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const key = await derive(
    password,
    Buffer.from(salt, 'base64url'),
    Number(memory),
    Number(passes),
    Number(parallelism),
    expected.length,
  ).catch(() => null);
  return key !== null && timingSafeEqual(key, expected);
}
