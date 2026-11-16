import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '@lister/api/data-access-db';
import { AuthModule } from '@lister/api/feature-auth';
import { MaintenanceModule } from '@lister/api/feature-maintenance';
import { SpacesModule } from '@lister/api/feature-spaces';
import { SyncModule } from '@lister/api/feature-sync';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    DatabaseModule.forRoot(() => ({
      path: process.env.DATABASE_PATH || 'data/lister.db',
      // The build copies packages/api/data-access-db/migrations next to main.js.
      migrationsFolder: join(__dirname, 'migrations'),
    })),
    AuthModule,
    HealthModule,
    MaintenanceModule,
    SpacesModule,
    SyncModule,
  ],
})
export class AppModule {}
