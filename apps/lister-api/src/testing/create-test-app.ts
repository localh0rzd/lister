import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  DatabaseConnection,
  createTestDatabase,
} from '@lister/api/data-access-db';
import { AppModule } from '../app/app.module';
import { type AppOptions, configureApp } from '../app/configure-app';

export interface TestAppOptions extends AppOptions {
  /** Extra controllers, for routes that only the test needs (e.g. a guarded probe). */
  controllers?: Type[];
}

export interface TestApp {
  app: NestExpressApplication;
  /** Base URL, e.g. `http://127.0.0.1:41234`; the API is under `${url}/api`. */
  url: string;
  /** The app's own fresh in-memory database, for arranging and checking data. */
  database: DatabaseConnection;
  close(): Promise<void>;
}

/**
 * The real `AppModule` with `main.ts`'s setup, on a fresh migrated in-memory database and a
 * random port, for integration tests (`testing` skill). Close it in `afterEach`.
 */
export async function createTestApp(
  options: TestAppOptions = {},
): Promise<TestApp> {
  const database = createTestDatabase();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
  })
    .overrideProvider(DatabaseConnection)
    .useValue(database)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: false,
  });
  configureApp(app, { webRoot: options.webRoot });
  await app.listen(0, '127.0.0.1');
  return {
    app,
    url: await app.getUrl(),
    database,
    close: async () => {
      await app.close();
      database.onApplicationShutdown();
    },
  };
}
