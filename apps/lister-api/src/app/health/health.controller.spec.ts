import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DatabaseConnection } from '@lister/api/data-access-db';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

async function setup(healthy: boolean) {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      HealthService,
      { provide: DatabaseConnection, useValue: { isHealthy: () => healthy } },
    ],
  }).compile();
  return moduleRef.get(HealthController);
}

describe('HealthController', () => {
  it('reports ok when the database answers', async () => {
    const controller = await setup(true);

    expect(controller.check()).toMatchObject({
      status: 'ok',
      service: 'lister-api',
      db: 'ok',
    });
  });

  it('answers 503 when the database does not', async () => {
    const controller = await setup(false);

    expect(() => controller.check()).toThrow(ServiceUnavailableException);
  });
});
