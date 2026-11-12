import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseConnection } from '@lister/api/data-access-db';
import type { HealthResponse } from '@lister/shared/api-contracts';

@Injectable()
export class HealthService {
  constructor(private readonly database: DatabaseConnection) {}

  /** Throws 503 when the database doesn't answer, so health checks (Docker) see the failure. */
  check(): HealthResponse {
    if (!this.database.isHealthy()) {
      throw new ServiceUnavailableException('The database is unavailable');
    }
    return {
      status: 'ok',
      service: 'lister-api',
      db: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
