import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import { API_PREFIX } from '@lister/shared/api-contracts';
import {
  RESET_PASSWORD_COMMAND,
  runResetPasswordCommand,
} from '@lister/api/feature-auth';
import {
  RESTORE_BACKUP_COMMAND,
  runRestoreBackupCommand,
} from '@lister/api/feature-maintenance';
import { AppModule } from './app/app.module';
import { configureApp } from './app/configure-app';

/** `node main.js <command> …` (reset-password, restore-backup): runs against the same database, then exits. */
async function runCommand(command: string, args: string[]): Promise<number> {
  const run =
    command === RESET_PASSWORD_COMMAND
      ? runResetPasswordCommand
      : command === RESTORE_BACKUP_COMMAND
        ? runRestoreBackupCommand
        : undefined;
  if (!run) {
    console.error(
      `Unknown command "${command}". Commands: ${RESET_PASSWORD_COMMAND}, ${RESTORE_BACKUP_COMMAND}`,
    );
    return 2;
  }
  const context = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  try {
    return await run(context, args, (line) => console.log(line));
  } finally {
    await context.close();
  }
}

async function bootstrap() {
  const [command, ...args] = process.argv.slice(2);
  if (command) {
    process.exitCode = await runCommand(command, args);
    return;
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // The production build sits next to ours (dist/apps/lister-web/browser); WEB_ROOT overrides.
  const webRoot =
    process.env.WEB_ROOT || join(__dirname, '../lister-web/browser');
  const servesWeb = existsSync(join(webRoot, 'index.html'));
  if (process.env.WEB_ROOT && !servesWeb) {
    // Asked for explicitly (e.g. the Docker image) but not there: don't start API-only.
    throw new Error(`WEB_ROOT has no index.html: ${process.env.WEB_ROOT}`);
  }
  configureApp(app, { webRoot: servesWeb ? webRoot : undefined });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  // Lets `nx serve` know the server is ready (set by Nx for continuous tasks).
  if (process.env.NX_READY_SIGNAL_SOCKET) {
    try {
      // Function keeps TypeScript and bundlers from rewriting or bundling the import
      const load = new Function('s', 'return import(s)') as (
        s: string,
      ) => Promise<{ emitReadySignal(server: unknown): boolean }>;
      (await load('@nx/js/ready-signal')).emitReadySignal(app.getHttpServer());
    } catch {
      // @nx/js isn't installed
    }
  }

  Logger.log(`🚀 lister-api running on http://localhost:${port}/${API_PREFIX}`);
  if (servesWeb) Logger.log(`Serving the web app from ${webRoot}`);
}

bootstrap();
