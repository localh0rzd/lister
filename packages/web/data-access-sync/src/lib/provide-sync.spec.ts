import { config as zodConfig } from 'zod/mini';
import { provideSync } from './provide-sync';

describe('provideSync', () => {
  it('keeps Zod from probing for eval, which the CSP forbids', () => {
    expect(provideSync).toBeDefined();
    expect(zodConfig().jitless).toBe(true);
  });
});
