import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { SyncIoAdapter, allowedOrigins } from '@lister/api/feature-sync';
import { API_PREFIX } from '@lister/shared/api-contracts';

/** App-wide setup shared by `main.ts` and the integration tests (`createTestApp()`). */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();
  app.useWebSocketAdapter(new SyncIoAdapter(app, allowedOrigins(process.env)));
}
