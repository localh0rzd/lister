import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { API_PREFIX } from '@lister/shared/api-contracts';
import { AppModule } from './app/app.module';
import { configureApp } from './app/configure-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

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
}

bootstrap();
