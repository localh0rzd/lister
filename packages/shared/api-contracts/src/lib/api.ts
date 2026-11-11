/** Global route prefix of the API. The web app's dev proxy forwards `/api/*` to it. */
export const API_PREFIX = 'api';

/** Builds an API path, e.g. `apiPath('health')` -> `/api/health`. */
export function apiPath(...segments: string[]): string {
  return ['', API_PREFIX, ...segments].join('/');
}
