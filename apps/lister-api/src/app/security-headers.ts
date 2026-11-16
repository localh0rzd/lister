import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * The Content Security Policy header (design §2.9). Scripts are not listed here on purpose: the
 * production build carries its own `<meta>` policy (Angular's `security.autoCsp`) that allows the
 * inline scripts by hash, and a second `script-src` here would be intersected with it. This
 * header covers everything else, and `frame-ancestors`, which a `<meta>` policy cannot set.
 * Styles allow `'unsafe-inline'` because Angular inlines critical CSS and Material sets style
 * attributes.
 */
export const CONTENT_SECURITY_POLICY = [
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const HSTS = 'max-age=31536000; includeSubDomains';

/**
 * Security headers on every response: API, static files and `index.html` alike. Register it
 * before `serveWebApp()`, whose Express middleware runs ahead of Nest's.
 */
export function addSecurityHeaders(
  app: NestExpressApplication,
  publicUrl: string | undefined,
): void {
  app.disable('x-powered-by');
  const https = publicUrl?.trim().toLowerCase().startsWith('https://');
  app.use(
    (
      _request: unknown,
      response: { setHeader(name: string, value: string): void },
      next: () => void,
    ) => {
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Referrer-Policy', 'same-origin');
      response.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
      // Traefik terminates TLS; the browser still needs to be told to stay on HTTPS.
      if (https) response.setHeader('Strict-Transport-Security', HSTS);
      next();
    },
  );
}
