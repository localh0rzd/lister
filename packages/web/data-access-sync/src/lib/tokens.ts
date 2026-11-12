import { InjectionToken } from '@angular/core';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@lister/shared/sync-protocol';
import { type Socket, io } from 'socket.io-client';

/** The sync socket, typed with the protocol's events. */
export type SyncSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Creates the (not yet connected) socket: same origin, `/socket.io`, WebSocket only (the dev
 * server proxies it to the API). Tests provide a fake.
 */
export const SYNC_SOCKET_FACTORY = new InjectionToken<() => SyncSocket>(
  'SYNC_SOCKET_FACTORY',
  {
    providedIn: 'root',
    factory: () => () =>
      io({ path: '/socket.io', transports: ['websocket'], autoConnect: false }),
  },
);

/** Holds a lock while `hold` runs; only one tab at a time gets it (Web Locks). */
export interface SyncLocks {
  request(name: string, hold: () => Promise<void>): void;
}

export const SYNC_LOCKS = new InjectionToken<SyncLocks>('SYNC_LOCKS', {
  providedIn: 'root',
  factory: () => ({
    request: (name, hold) => {
      const locks =
        typeof navigator === 'undefined' ? undefined : navigator.locks;
      // Without Web Locks every tab syncs; the server's idempotency keeps that safe.
      if (!locks) void hold();
      else void locks.request(name, hold);
    },
  }),
});

/** Current time in epoch milliseconds; replaced in tests. */
export const SYNC_CLOCK = new InjectionToken<() => number>('SYNC_CLOCK', {
  providedIn: 'root',
  factory: () => () => Date.now(),
});
