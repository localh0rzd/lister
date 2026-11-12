import axios from 'axios';
import type { HealthResponse } from '@lister/shared/api-contracts';

describe('GET /api/health', () => {
  it('reports ok', async () => {
    const res = await axios.get<HealthResponse>('/api/health');

    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({
      status: 'ok',
      service: 'lister-api',
      db: 'ok',
    });
  });
});
