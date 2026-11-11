import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@lister/shared/api-contracts';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  check(): HealthResponse {
    return this.health.check();
  }
}
