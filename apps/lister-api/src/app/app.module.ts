import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '@lister/api/data-access-db';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    DatabaseModule.forRoot(() => ({
      path: process.env.DATABASE_PATH || 'data/lister.db',
      // The build copies packages/api/data-access-db/migrations next to main.js.
      migrationsFolder: join(__dirname, 'migrations'),
    })),
    HealthModule,
  ],
})
export class AppModule {}
