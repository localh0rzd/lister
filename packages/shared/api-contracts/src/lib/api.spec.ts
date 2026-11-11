import { apiPath } from './api';

describe('apiPath', () => {
  it('prefixes segments with /api', () => {
    expect(apiPath('health')).toBe('/api/health');
    expect(apiPath('lists', '42')).toBe('/api/lists/42');
  });
});
