import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  type ClientToServerEvents,
  PROTOCOL_VERSION,
  type ServerToClientEvents,
  helloSchema,
  pullSchema,
  pushSchema,
} from '@lister/shared/sync-protocol';
import type { Server, Socket } from 'socket.io';
import { DEV_USER_ID } from './dev-seed';
import { MutationService } from './mutation.service';
import { SyncReader } from './sync-reader';

interface SocketData {
  userId?: string;
  clientId?: string;
  /** Spaces this socket's user belongs to; set by `hello`. */
  spaceIds?: string[];
}

type SyncServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;
type SyncSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/** One Socket.IO room per space; pokes go to everyone in it (design §4.2). */
export const spaceRoom = (spaceId: string) => `space:${spaceId}`;

/**
 * The sync protocol over Socket.IO: hello → welcome, pull → rows, push → ack/reject per mutation
 * plus a poke of the changed rows to the space's room. Origin checks and the WebSocket-only
 * transport live in `SyncIoAdapter`.
 */
@WebSocketGateway()
export class SyncGateway {
  private readonly logger = new Logger(SyncGateway.name);

  @WebSocketServer()
  private readonly server!: SyncServer;

  constructor(
    private readonly mutations: MutationService,
    private readonly reader: SyncReader,
  ) {}

  @SubscribeMessage('hello')
  hello(
    @ConnectedSocket() socket: SyncSocket,
    @MessageBody() body: unknown,
  ): void {
    const hello = helloSchema.safeParse(body);
    if (!hello.success) return this.drop(socket, 'invalid hello');
    if (hello.data.protocolVersion !== PROTOCOL_VERSION) {
      socket.emit('updateRequired', { protocolVersion: PROTOCOL_VERSION });
      socket.disconnect(true);
      return;
    }

    // Until sessions exist (T-025), every socket is the dev user.
    const userId = DEV_USER_ID;
    const spaces = this.reader.allSpaces();
    socket.data = {
      userId,
      clientId: hello.data.clientId,
      spaceIds: spaces.map((s) => s.id),
    };
    for (const space of spaces) void socket.join(spaceRoom(space.id));
    socket.emit('welcome', {
      userId,
      spaces: spaces.map((space) => ({
        ...space,
        members: [{ userId, displayName: 'Dev user' }],
      })),
    });
  }

  @SubscribeMessage('pull')
  pull(
    @ConnectedSocket() socket: SyncSocket,
    @MessageBody() body: unknown,
  ): void {
    if (!socket.data.userId) return this.drop(socket, 'pull before hello');
    const pull = pullSchema.safeParse(body);
    if (!pull.success) return this.drop(socket, 'invalid pull');
    if (!socket.data.spaceIds?.includes(pull.data.spaceId)) {
      return this.drop(socket, 'pull for a space the user is not in');
    }
    let rows;
    try {
      rows = this.reader.rowsSince(pull.data.spaceId, pull.data.since);
    } catch (error) {
      this.logger.error(`Pull for ${pull.data.spaceId} failed`, error as Error);
      socket.disconnect(true);
      return;
    }
    if (rows) socket.emit('rows', rows);
  }

  /** Mutations are applied strictly in order; each gets its own ack or reject. */
  @SubscribeMessage('push')
  push(
    @ConnectedSocket() socket: SyncSocket,
    @MessageBody() body: unknown,
  ): void {
    const { userId, clientId, spaceIds = [] } = socket.data;
    if (!userId) return this.drop(socket, 'push before hello');
    const push = pushSchema.safeParse(body);
    if (!push.success) return this.drop(socket, 'invalid push');

    for (const entry of push.data.mutations) {
      if (!spaceIds.includes(String(entry['spaceId']))) {
        socket.emit('reject', {
          mutationId: entry.mutationId,
          reason: "You can't change this space",
        });
        continue;
      }
      let applied;
      try {
        applied = this.mutations.apply(entry, { userId, clientId });
      } catch (error) {
        // Not the mutation's fault (e.g. the disk): no reject, so the client keeps it and retries.
        this.logger.error(
          `Applying ${entry.mutationId} failed`,
          error as Error,
        );
        socket.disconnect(true);
        return;
      }
      const { result, spaceId, rows } = applied;
      if (spaceId && result.status === 'ack') {
        this.server
          .to(spaceRoom(spaceId))
          .emit('poke', { spaceId, version: result.version, rows });
      }
      if (result.status === 'ack') {
        socket.emit('ack', {
          mutationId: result.mutationId,
          version: result.version,
        });
      } else {
        socket.emit('reject', {
          mutationId: result.mutationId,
          reason: result.reason,
        });
      }
    }
  }

  /** Protocol violations end the connection; the client reconnects and starts with hello. */
  private drop(socket: SyncSocket, why: string): void {
    this.logger.warn(`Disconnecting ${socket.id}: ${why}`);
    socket.disconnect(true);
  }
}
