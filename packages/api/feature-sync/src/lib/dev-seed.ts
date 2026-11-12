import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { DatabaseConnection, schema } from '@lister/api/data-access-db';

/**
 * Until accounts exist (T-022 – T-025) everybody is this one dev user in this one dev space.
 * T-024 removes both.
 */
export const DEV_USER_ID = '0190a000-0000-7000-8000-00000000d001';
export const DEV_SPACE_ID = '0190a000-0000-7000-8000-00000000d5ac';
export const DEV_SPACE_NAME = 'Home';

/** Makes sure the dev space exists, outside production (or with LISTER_DEV_SEED=true). */
@Injectable()
export class DevSeed implements OnApplicationBootstrap {
  private readonly logger = new Logger(DevSeed.name);

  constructor(private readonly database: DatabaseConnection) {}

  onApplicationBootstrap(): void {
    // LISTER_DEV_SEED=true keeps it in a local production build (npm run start:prod).
    const wanted =
      process.env['NODE_ENV'] !== 'production' ||
      process.env['LISTER_DEV_SEED'] === 'true';
    if (!wanted) return;
    const inserted = this.database.db
      .insert(schema.spaces)
      .values({
        id: DEV_SPACE_ID,
        name: DEV_SPACE_NAME,
        version: 0,
        createdAt: Date.now(),
      })
      .onConflictDoNothing()
      .run();
    if (inserted.changes > 0)
      this.logger.log(`Created the dev space "${DEV_SPACE_NAME}"`);
  }
}
