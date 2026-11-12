import { randomBytes } from 'node:crypto';
import type { INestApplicationContext } from '@nestjs/common';
import { AuthService } from './auth.service';

export const RESET_PASSWORD_COMMAND = 'reset-password';

/** A readable temporary password: 20 characters from an alphabet without look-alikes. */
function temporaryPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRTUVWXYZ2346789';
  return Array.from(
    randomBytes(20),
    (byte) => alphabet[byte % alphabet.length],
  ).join('');
}

/**
 * `reset-password <username>`: for when no admin can sign in (design D9). Sets a random temporary
 * password that must be changed at the next sign-in, signs the user out everywhere and prints
 * the password. Returns the process exit code. Run it on the server:
 * `node main.js reset-password <username>`.
 */
export async function runResetPasswordCommand(
  context: INestApplicationContext,
  args: string[],
  print: (line: string) => void,
): Promise<number> {
  const [username, ...rest] = args;
  if (!username || rest.length > 0) {
    print(`Usage: ${RESET_PASSWORD_COMMAND} <username>`);
    return 2;
  }
  const password = temporaryPassword();
  const auth = context.get(AuthService);
  const stored = await auth.setTemporaryPassword(username, password);
  if (stored === null) {
    print(`No user named "${username}"`);
    return 1;
  }
  print(`Temporary password for ${stored}: ${password}`);
  print(
    'It must be changed at the next sign-in. All their sessions were ended.',
  );
  return 0;
}
