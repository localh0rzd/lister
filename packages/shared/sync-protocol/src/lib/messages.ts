import * as z from 'zod/mini';
import { LIMITS } from '@lister/shared/domain';
import { idSchema, versionSchema } from './common';
import type { MutationInput } from './mutations';
import { rowSetSchema } from './rows';

/** Most mutations a client sends in one push; it sends the rest after the acks. */
export const MAX_PUSH_MUTATIONS = 100;

/**
 * Most bytes (UTF-8 JSON) of mutations a client sends in one push. The server's Socket.IO
 * message cap (`maxHttpBufferSize`) is set a little above it, since a message over the cap
 * closes the connection without a reject, and the client would push the same outbox head again
 * after every reconnect. The client packs each push under this budget and refuses a single
 * change bigger than it before queueing it.
 */
export const MAX_PUSH_BYTES = 4_000_000;

// Client → server

export const helloSchema = z.strictObject({
  protocolVersion: z.int().check(z.positive()),
  /** Random per-device id, kept in the local database. */
  clientId: idSchema,
});

export const pullSchema = z.strictObject({
  spaceId: idSchema,
  /** The last version the client has; 0 asks for a full snapshot. */
  since: versionSchema,
  /** The timeline of the space's rows the client holds (`''` when it holds none). */
  timeline: z.string().check(z.maxLength(64)),
});

/**
 * The envelope only checks that every entry names its mutation; each entry is then validated on
 * its own with `parseMutation`, so one invalid mutation is rejected by id and the rest still
 * apply. A push whose entries don't even carry a readable `mutationId` is a protocol error.
 */
export const pushSchema = z.strictObject({
  mutations: z
    .array(z.looseObject({ mutationId: idSchema }))
    .check(z.minLength(1), z.maxLength(MAX_PUSH_MUTATIONS)),
});

// Server → client: tolerant (`z.object` drops unknown fields), so older clients keep working
// when the server adds something (design §2.5).

export const welcomeSchema = z.object({
  userId: idSchema,
  spaces: z.array(
    z.object({
      id: idSchema,
      name: z.string().check(z.maxLength(LIMITS.spaceName)),
      version: versionSchema,
      members: z.array(z.object({ userId: idSchema, displayName: z.string() })),
    }),
  ),
});

/** The client's protocol is too old; it must reload to the new app version. */
export const updateRequiredSchema = z.object({
  protocolVersion: z.int().check(z.positive()),
});

/** Answer to `pull`: everything changed after `since`, up to `version`. */
export const rowsSchema = z.object({
  spaceId: idSchema,
  version: versionSchema,
  /** The space's timeline (changed by a restore); the client sends it back with its next pull. */
  timeline: z.string(),
  /** True when this is the space's whole state (since 0, or `since` predates purged tombstones). */
  snapshot: z.boolean(),
  rows: rowSetSchema,
});

export const ackSchema = z.object({
  mutationId: idSchema,
  /** The space version that includes the mutation's effect. */
  version: versionSchema,
});

export const rejectSchema = z.object({
  mutationId: idSchema,
  /** Human-readable; shown to the user. */
  reason: z.string().check(z.minLength(1)),
});

/** Rows changed by one mutation, broadcast to everyone in the space. */
export const pokeSchema = z.object({
  spaceId: idSchema,
  version: versionSchema,
  rows: rowSetSchema,
});

export type Hello = z.infer<typeof helloSchema>;
export type Pull = z.infer<typeof pullSchema>;
/** What a client sends; the server reads it with `pushSchema`, then `parseMutation` per entry. */
export interface Push {
  mutations: MutationInput[];
}
export type Welcome = z.infer<typeof welcomeSchema>;
export type UpdateRequired = z.infer<typeof updateRequiredSchema>;
export type Rows = z.infer<typeof rowsSchema>;
export type Ack = z.infer<typeof ackSchema>;
export type Reject = z.infer<typeof rejectSchema>;
export type Poke = z.infer<typeof pokeSchema>;

/**
 * Socket.IO event map, client → server (`Socket<ServerToClientEvents, ClientToServerEvents>`).
 *
 * Failure behaviour (design §4.2): the server disconnects (reason `io server disconnect`) after
 * `updateRequired`, on a protocol violation (invalid or out-of-order message, a space the user
 * isn't in), and when storage fails while pulling or pushing. A storage failure sends **no**
 * reject, so the mutation stays in the outbox. Socket.IO doesn't reconnect after a server
 * disconnect on its own, so the client reconnects itself, with backoff, then starts with hello.
 */
export interface ClientToServerEvents {
  hello(message: Hello): void;
  pull(message: Pull): void;
  push(message: Push): void;
}

/** Socket.IO event map, server → client. */
export interface ServerToClientEvents {
  welcome(message: Welcome): void;
  updateRequired(message: UpdateRequired): void;
  rows(message: Rows): void;
  ack(message: Ack): void;
  reject(message: Reject): void;
  poke(message: Poke): void;
}
