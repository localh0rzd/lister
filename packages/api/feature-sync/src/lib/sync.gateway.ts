import {
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  type AccountEvent,
  AccountEvents,
  AuthService,
} from '@lister/api/feature-auth';
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
import { MutationService } from './mutation.service';
import { SyncReader } from './sync-reader';

/** `userId` and `sessionId` are set by the handshake; `clientId` by `hello`. */
interface SocketData {
  userId?: string;
  sessionId?: string;
  clientId?: string;
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
 * plus a poke of the changed rows to the space's room. The Origin check, the session check of the
 * handshake and the WebSocket-only transport live in `SyncIoAdapter`.
 *
 * Authorization never trusts what the socket remembers: every pull and push asks the database
 * whether the user is still a member (and the session still alive), and so does every poke for
 * the sockets it reaches. The rooms are kept in step by `membershipsChanged()`, which the spaces
 * feature calls after every membership change; `AccountEvents` ends the connections of ended
 * sessions at once and re-welcomes the members of a deleted or renamed user's spaces.
 */
@WebSocketGateway()
export class SyncGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SyncGateway.name);

  /** Unset in an application context without an HTTP server (the reset command). */
  @WebSocketServer()
  private readonly server?: SyncServer;

  private unsubscribe?: () => void;

  constructor(
    private readonly mutations: MutationService,
    private readonly reader: SyncReader,
    private readonly auth: AuthService,
    private readonly accounts: AccountEvents,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.accounts.subscribe((event) =>
      this.onAccountEvent(event),
    );
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
  }

  private onAccountEvent(event: AccountEvent): void {
    if (event.kind === 'membersChanged') {
      this.membershipsChanged(event.userIds);
      return;
    }
    // Sessions of this user ended: their connections end now, not at their next message.
    for (const socket of this.sockets()) {
      if (socket.data.userId === event.userId) this.signedIn(socket);
    }
  }

  private sockets(): Iterable<SyncSocket> {
    return this.server?.sockets.sockets.values() ?? [];
  }

  /**
   * Call after the memberships (or the name) of these users' spaces changed: each of their
   * connected clients leaves the rooms of spaces it no longer belongs to, which stops its pokes
   * at once, and gets a new welcome with its current spaces (the web app then drops the others).
   * Synchronous, so it runs before any further message is handled.
   */
  membershipsChanged(userIds: Iterable<string>): void {
    const users = new Set(userIds);
    for (const socket of this.sockets()) {
      const { clientId, userId } = socket.data;
      if (clientId && userId && users.has(userId) && this.signedIn(socket)) {
        this.welcome(socket);
      }
    }
  }

  /** Puts the socket into the rooms of its user's spaces (and out of any other), then welcomes it. */
  private welcome(socket: SyncSocket): void {
    const userId = socket.data.userId as string;
    const spaces = this.reader.spacesOf(userId);
    const rooms = new Set(spaces.map((space) => spaceRoom(space.id)));
    for (const room of [...socket.rooms]) {
      if (room.startsWith('space:') && !rooms.has(room))
        void socket.leave(room);
    }
    for (const room of rooms) void socket.join(room);
    socket.emit('welcome', { userId, spaces });
  }

  /** The user's id while their session is alive; otherwise ends the connection. */
  private signedIn(socket: SyncSocket): string | undefined {
    const { userId, sessionId } = socket.data;
    if (userId && sessionId && this.auth.isSessionActive(sessionId)) {
      return userId;
    }
    this.drop(socket, 'the session ended');
    return undefined;
  }

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

    if (!this.signedIn(socket)) return;
    socket.data.clientId = hello.data.clientId;
    this.welcome(socket);
  }

  @SubscribeMessage('pull')
  pull(
    @ConnectedSocket() socket: SyncSocket,
    @MessageBody() body: unknown,
  ): void {
    if (!socket.data.clientId) return this.drop(socket, 'pull before hello');
    const userId = this.signedIn(socket);
    if (!userId) return;
    const pull = pullSchema.safeParse(body);
    if (!pull.success) return this.drop(socket, 'invalid pull');
    if (!this.reader.isMember(userId, pull.data.spaceId)) {
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
    const { clientId } = socket.data;
    if (!clientId) return this.drop(socket, 'push before hello');
    const userId = this.signedIn(socket);
    if (!userId) return;
    const push = pushSchema.safeParse(body);
    if (!push.success) return this.drop(socket, 'invalid push');

    for (const entry of push.data.mutations) {
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
        this.poke({ spaceId, version: result.version, rows });
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

  /**
   * Sends the changed rows to everyone in the space's room whose session is still alive (one
   * query for all of them); a socket whose session ended or expired is disconnected instead.
   */
  private poke(poke: Parameters<ServerToClientEvents['poke']>[0]): void {
    const ids = this.server?.sockets.adapter.rooms.get(spaceRoom(poke.spaceId));
    if (!ids) return;
    const sockets = [...ids].flatMap((id) => {
      const socket = this.server?.sockets.sockets.get(id);
      return socket ? [socket] : [];
    });
    const live = this.auth.activeSessions(
      sockets.flatMap((socket) => socket.data.sessionId ?? []),
    );
    for (const socket of sockets) {
      const { sessionId } = socket.data;
      if (sessionId && live.has(sessionId)) socket.emit('poke', poke);
      else this.drop(socket, 'the session ended');
    }
  }

  /** Protocol violations end the connection; the client reconnects and starts with hello. */
  private drop(socket: SyncSocket, why: string): void {
    this.logger.warn(`Disconnecting ${socket.id}: ${why}`);
    socket.disconnect(true);
  }
}
