import { Controller, Get } from '@nestjs/common';
import { Public } from '@lister/api/feature-auth';
import type { HealthResponse } from '@lister/shared/api-contracts';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get()
  check(): HealthResponse {
    return this.health.check();
  }
}
