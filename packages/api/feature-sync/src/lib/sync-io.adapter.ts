import type { IncomingMessage } from 'node:http';
import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AuthService, readSessionToken } from '@lister/api/feature-auth';
import { MAX_PUSH_BYTES } from '@lister/shared/sync-protocol';
import type { Server, ServerOptions } from 'socket.io';

/**
 * Socket.IO with WebSocket transport only. The handshake is refused unless its `Origin` header
 * is one of `origins` (see `allowedOrigins`) and its session cookie belongs to a live session of a
 * user who isn't forced to change their password (the same rules as the HTTP `AuthGuard`). The
 * user is left in `socket.data` for the gateway.
 */
export class SyncIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly origins: readonly string[],
  ) {
    super(app);
    this.context = app;
  }

  private readonly context: INestApplicationContext;

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server: Server = super.createIOServer(port, {
      ...options,
      transports: ['websocket'],
      // Room for the largest push a client sends, plus the envelope and Socket.IO framing.
      maxHttpBufferSize: MAX_PUSH_BYTES + 64 * 1024,
      // The web app bundles socket.io-client; don't serve /socket.io/socket.io.js.
      serveClient: false,
      allowRequest: (
        request: IncomingMessage,
        callback: (error: string | null | undefined, allowed: boolean) => void,
      ) => {
        const origin = request.headers.origin;
        callback(null, origin !== undefined && this.origins.includes(origin));
      },
    });
    server.use((socket, next) => {
      const token = readSessionToken(socket.request.headers.cookie);
      const found = token
        ? this.context.get(AuthService, { strict: false }).authenticate(token)
        : null;
      if (!found || found.user.mustChangePassword) {
        next(new Error('Sign in first'));
        return;
      }
      socket.data = { userId: found.user.id, sessionId: found.sessionId };
      next();
    });
    return server;
  }
}
