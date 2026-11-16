import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { DatabaseConnection } from '@lister/api/data-access-db';
import { BackupService } from './backup.service';
import { PurgeService } from './purge.service';

/** The hour (UTC) after which the nightly jobs may run. */
export const MAINTENANCE_HOUR_UTC = 3;
const CHECK_EVERY_MS = 15 * 60 * 1000;

/**
 * Runs the backup and the purge once a day, after 03:00 UTC (or at startup if the instance was
 * down then). A check every 15 minutes finds out what is due, so it survives restarts and
 * clock changes without a scheduler library. Does nothing for an in-memory database (tests).
 */
@Injectable()
export class MaintenanceScheduler
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(MaintenanceScheduler.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly database: DatabaseConnection,
    private readonly backups: BackupService,
    private readonly purges: PurgeService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.database.sqlite.memory) return;
    this.timer = setInterval(() => this.runDue(Date.now()), CHECK_EVERY_MS);
    this.timer.unref();
    // Soon after startup, not during it.
    setTimeout(() => this.runDue(Date.now()), 30_000).unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  /** Runs whichever of the backup and the purge is due at `now`. Never throws. */
  runDue(now: number): void {
    if (new Date(now).getUTCHours() < MAINTENANCE_HOUR_UTC) return;
    // The backup goes first, so it still holds what the purge removes.
    if (this.backups.isDue(now)) {
      try {
        const path = this.backups.backup(now);
        this.logger.log(`Backup written to ${path}`);
      } catch (error) {
        this.logger.error('Backup failed', error);
      }
    }
    if (this.purges.isDue(now)) {
      try {
        const removed = this.purges.purge(now);
        this.purges.markDone(now);
        this.logger.log(`Purged ${removed} rows`);
      } catch (error) {
        this.logger.error('Purge failed', error);
      }
    }
  }
}
