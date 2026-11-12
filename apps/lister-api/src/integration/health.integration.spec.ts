import type { HealthResponse } from '@lister/shared/api-contracts';
import { type TestApp, createTestApp } from '../testing/create-test-app';

describe('GET /api/health', () => {
  let api: TestApp;
  beforeEach(async () => {
    api = await createTestApp();
  });
  afterEach(() => api.close());

  it('reports the API and the database as ok', async () => {
    const response = await fetch(`${api.url}/api/health`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as HealthResponse;
    expect(body).toMatchObject({
      status: 'ok',
      service: 'lister-api',
      db: 'ok',
    });
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  it('answers 503 when the database is unavailable', async () => {
    api.database.sqlite.close();

    const response = await fetch(`${api.url}/api/health`);

    expect(response.status).toBe(503);
  });

  it('is only served under the /api prefix', async () => {
    expect((await fetch(`${api.url}/health`)).status).toBe(404);
  });
});
