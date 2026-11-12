import { schema } from '@lister/api/data-access-db';
import { DEV_SPACE_ID } from '@lister/api/feature-sync';
import { type TestApp, createTestApp } from '../testing/create-test-app';

describe('startup outside production', () => {
  let api: TestApp;
  beforeEach(async () => {
    api = await createTestApp();
  });
  afterEach(() => api.close());

  it('creates the dev space (until accounts arrive in T-024)', () => {
    expect(api.database.db.select().from(schema.spaces).all()).toEqual([
      expect.objectContaining({ id: DEV_SPACE_ID, name: 'Home' }),
    ]);
  });
});
