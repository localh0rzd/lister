import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SyncIoAdapter, allowedOrigins } from '@lister/api/feature-sync';
import { API_PREFIX } from '@lister/shared/api-contracts';
import { serveWebApp } from './web-hosting';

export interface AppOptions {
  /** The built web app to serve (production); leave out when the dev server serves it. */
  webRoot?: string;
}

/** App-wide setup shared by `main.ts` and the integration tests (`createTestApp()`). */
export function configureApp(
  app: NestExpressApplication,
  options: AppOptions = {},
): void {
  app.set('trust proxy', trustProxySetting(process.env['TRUST_PROXY']));
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();
  app.useWebSocketAdapter(new SyncIoAdapter(app, allowedOrigins(process.env)));
  if (options.webRoot) serveWebApp(app, options.webRoot);
}

/**
 * Which proxies Express trusts for `X-Forwarded-*` (client IPs for rate limiting). Behind Traefik
 * in Docker that is a private address, so the default trusts loopback and private ranges only;
 * a client on a public address can't forge its IP. `TRUST_PROXY` overrides: a number of hops, or
 * addresses/ranges (see Express's "trust proxy").
 */
export function trustProxySetting(value: string | undefined): string | number {
  if (!value?.trim()) return 'loopback, linklocal, uniquelocal';
  return /^\d+$/.test(value.trim()) ? Number(value) : value;
}
