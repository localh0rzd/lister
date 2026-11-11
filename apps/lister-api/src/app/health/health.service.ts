import { Injectable } from '@nestjs/common';
import type { HealthResponse } from '@lister/shared/api-contracts';

@Injectable()
export class HealthService {
  check(): HealthResponse {
    return {
      status: 'ok',
      service: 'lister-api',
      timestamp: new Date().toISOString(),
    };
  }
}
