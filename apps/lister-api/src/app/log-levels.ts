import type { LogLevel } from '@nestjs/common';

/** Nest's levels from least to most talkative; `LOG_LEVEL=<one>` turns on that and every level before it. */
const ORDER = ['error', 'warn', 'log', 'debug', 'verbose'] as const;

export type LogLevelName = (typeof ORDER)[number];

export const DEFAULT_LOG_LEVEL: LogLevelName = 'log';

/** The CLI commands (reset-password, restore-backup) print their own output and log errors only. */
export const COMMAND_LOG_LEVELS: LogLevel[] = ['error'];

/**
 * The Nest log levels for `LOG_LEVEL` (unset or empty: `log`). An unknown value throws, so the
 * server stops at start-up with a message that names the choices.
 */
export function parseLogLevels(value: string | undefined): LogLevel[] {
  const name = (value?.trim() || DEFAULT_LOG_LEVEL).toLowerCase();
  const index = ORDER.indexOf(name as LogLevelName);
  if (index < 0) {
    throw new Error(
      `Invalid LOG_LEVEL "${value}": use one of ${ORDER.join(', ')} (default ${DEFAULT_LOG_LEVEL}).`,
    );
  }
  return ORDER.slice(0, index + 1);
}
