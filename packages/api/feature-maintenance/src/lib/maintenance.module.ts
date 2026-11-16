import { Module } from '@nestjs/common';
import { BackupService } from './backup.service';
import { MaintenanceScheduler } from './maintenance.scheduler';
import { PurgeService } from './purge.service';

/** Nightly backups and the daily purge of old tombstones and finished runs (D15). */
@Module({
  providers: [BackupService, PurgeService, MaintenanceScheduler],
  exports: [BackupService, PurgeService],
})
export class MaintenanceModule {}
