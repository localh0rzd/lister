import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import { API_PREFIX } from '@lister/shared/api-contracts';
import { AppModule } from './app/app.module';
import { configureApp } from './app/configure-app';

async function bootstrap() {
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
