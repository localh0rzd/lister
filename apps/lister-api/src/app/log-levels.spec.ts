import { COMMAND_LOG_LEVELS, parseLogLevels } from './log-levels';

describe('parseLogLevels', () => {
  it.each([
    [undefined, ['error', 'warn', 'log']],
    ['', ['error', 'warn', 'log']],
    ['  ', ['error', 'warn', 'log']],
    ['error', ['error']],
    ['warn', ['error', 'warn']],
    ['log', ['error', 'warn', 'log']],
    ['debug', ['error', 'warn', 'log', 'debug']],
    ['verbose', ['error', 'warn', 'log', 'debug', 'verbose']],
    ['DEBUG', ['error', 'warn', 'log', 'debug']],
    [' debug ', ['error', 'warn', 'log', 'debug']],
  ])('reads %j', (value, expected) => {
    expect(parseLogLevels(value)).toEqual(expected);
  });

  it.each(['trace', 'info', 'fatal', 'debug,warn', '0'])(
    'refuses %j and names the choices',
    (value) => {
      expect(() => parseLogLevels(value)).toThrow(
        `Invalid LOG_LEVEL "${value}": use one of error, warn, log, debug, verbose`,
      );
    },
  );

  it('keeps the CLI commands at errors only', () => {
    expect(COMMAND_LOG_LEVELS).toEqual(['error']);
  });
});
