import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { API_PREFIX } from '@lister/shared/api-contracts';

/** Paths the web app never answers: the API and the sync socket (design §2.9). Express routes
 * are case-insensitive, so this is too. */
const RESERVED = new RegExp(`^/(${API_PREFIX}|socket\\.io)(/|$)`, 'i');
/** A file request (it has an extension), as opposed to a page; the same rule as ngsw-config.json. */
const HAS_EXTENSION = /\.[^/]+$/;
/** Angular's hashed build files (`chunk-BTELt-c5.js`: 8 base64url characters) never change. */
const HASHED = /-[A-Za-z0-9_-]{8}\.(js|css|woff2)$/;
/** Files that must always be revalidated, so a new version is found. */
const ALWAYS_CHECK = new Set([
  'index.html',
  'ngsw.json',
  'ngsw-worker.js',
  'manifest.webmanifest',
]);

/**
 * Serves the built web app (`dist/apps/lister-web/browser`) from the API, so app, API and socket
 * share one origin. Unknown paths get `index.html` (the SPA's routes), except under `/api` and
 * `/socket.io`.
 */
export function serveWebApp(
  app: NestExpressApplication,
  webRoot: string,
): void {
  app.useStaticAssets(webRoot, {
    index: false,
    setHeaders: (response, path) => {
      const file = path.split(/[\\/]/).pop() ?? '';
      if (ALWAYS_CHECK.has(file))
        response.setHeader('Cache-Control', 'no-cache');
      else if (HASHED.test(file)) {
        response.setHeader(
          'Cache-Control',
          'public, max-age=31536000, immutable',
        );
      }
    },
  });

  const indexHtml = join(webRoot, 'index.html');
  app.use(
    (
      request: {
        method: string;
        path: string;
        accepts(type: string): string | false;
      },
      response: {
        setHeader(name: string, value: string): void;
        sendFile(path: string): void;
      },
      next: () => void,
    ) => {
      // Pages are paths without an extension. A missing file (an old chunk after a deploy, a
      // typo'd icon) gets a real 404, not index.html: browsers send `Accept: */*` for those.
      const isPage =
        (request.method === 'GET' || request.method === 'HEAD') &&
        !RESERVED.test(request.path) &&
        !HAS_EXTENSION.test(request.path);
      if (!isPage) return next();
      response.setHeader('Cache-Control', 'no-cache');
      response.sendFile(indexHtml);
    },
  );
}
