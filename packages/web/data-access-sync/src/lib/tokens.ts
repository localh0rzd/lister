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

/**
 * How a lock request may be changed: cancelled while it waits, or taken from a stuck queue. Never
 * both: browsers refuse `signal` with `steal` (`NotSupportedError`).
 */
export type SyncLockOptions =
  { signal?: AbortSignal; steal?: never } | { steal: true; signal?: never };

/**
 * Holds a lock while `hold` runs; only one tab at a time gets it (Web Locks). The promise
 * resolves once released and rejects when the wait is aborted, the request is refused, or the
 * lock is stolen from this page (`hold` keeps running then: the page must step back itself).
 */
export interface SyncLocks {
  request(
    name: string,
    hold: () => Promise<void>,
    options?: SyncLockOptions,
  ): Promise<void>;
  /** How many requests hold and wait for the lock now; absent without Web Locks. */
  query?(name: string): Promise<{ held: number; pending: number }>;
}

export const SYNC_LOCKS = new InjectionToken<SyncLocks>('SYNC_LOCKS', {
  providedIn: 'root',
  factory: () => {
    const locks = () =>
      typeof navigator === 'undefined' ? undefined : navigator.locks;
    return {
      request: (name, hold, options) => {
        const available = locks();
        // Without Web Locks every tab syncs; the server's idempotency keeps that safe.
        if (!available) return hold();
        return available.request(name, options ?? {}, hold);
      },
      query: async (name) => {
        const state = await locks()?.query();
        const count = (list?: LockInfo[]) =>
          list?.filter((lock) => lock.name === name).length ?? 0;
        return { held: count(state?.held), pending: count(state?.pending) };
      },
    } satisfies SyncLocks;
  },
});

/** Current time in epoch milliseconds; replaced in tests. */
export const SYNC_CLOCK = new InjectionToken<() => number>('SYNC_CLOCK', {
  providedIn: 'root',
  factory: () => () => Date.now(),
});
