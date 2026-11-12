import type { INestApplicationContext } from '@nestjs/common';
import { runResetPasswordCommand } from './reset-password.command';
import { AuthService } from './auth.service';

describe('reset-password command', () => {
  const setTemporaryPassword = vi.fn();
  const context = {
    get: (token: unknown) =>
      token === AuthService ? { setTemporaryPassword } : undefined,
  } as unknown as INestApplicationContext;
  const lines: string[] = [];
  const print = (line: string) => lines.push(line);

  beforeEach(() => {
    setTemporaryPassword.mockReset();
    lines.length = 0;
  });

  it.each([[[]], [['a', 'b']]])('prints usage for %j', async (args) => {
    expect(await runResetPasswordCommand(context, args, print)).toBe(2);
    expect(lines[0]).toMatch(/^Usage:/);
    expect(setTemporaryPassword).not.toHaveBeenCalled();
  });

  it('prints a fresh random password for a known user', async () => {
    setTemporaryPassword.mockResolvedValue(true);

    expect(await runResetPasswordCommand(context, ['anna'], print)).toBe(0);

    const [username, password] = setTemporaryPassword.mock.calls[0];
    expect(username).toBe('anna');
    expect(password).toHaveLength(20);
    expect(lines[0]).toContain(password);
  });

  it('fails for an unknown user', async () => {
    setTemporaryPassword.mockResolvedValue(false);

    expect(await runResetPasswordCommand(context, ['nobody'], print)).toBe(1);
    expect(lines[0]).toContain('nobody');
  });
});
