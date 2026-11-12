import type { IncomingMessage } from 'node:http';
import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';

/**
 * Socket.IO with WebSocket transport only, and the handshake refused unless its `Origin` header
 * is one of `origins` (see `allowedOrigins`).
 */
export class SyncIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly origins: readonly string[],
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    return super.createIOServer(port, {
      ...options,
      transports: ['websocket'],
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
  }
}
