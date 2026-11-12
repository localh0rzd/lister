/** The dev server, whose proxy forwards /socket.io to the API in development. */
export const DEV_WEB_ORIGIN = 'http://localhost:4200';

/**
 * Origins allowed to open the sync socket: the origin of `PUBLIC_URL`, and the dev server outside
 * production. A WebSocket isn't covered by CORS, so this check is what stops other sites from
 * using a signed-in visitor's cookies (cross-site WebSocket hijacking).
 */
export function allowedOrigins(
  env: Record<string, string | undefined>,
): string[] {
  const production = env['NODE_ENV'] === 'production';
  const publicUrl = env['PUBLIC_URL']?.trim();
  if (!publicUrl) {
    if (production) {
      throw new Error(
        'PUBLIC_URL must be set in production (e.g. https://lister.example.com)',
      );
    }
    return [DEV_WEB_ORIGIN];
  }
  let origin: string;
  try {
    origin = new URL(publicUrl).origin;
  } catch {
    throw new Error(`PUBLIC_URL is not a URL: ${publicUrl}`);
  }
  return production ? [origin] : [...new Set([origin, DEV_WEB_ORIGIN])];
}
