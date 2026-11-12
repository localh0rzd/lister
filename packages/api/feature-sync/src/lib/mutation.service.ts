import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { DatabaseConnection, schema } from '@lister/api/data-access-db';
import {
  type Mutation,
  type RowSet,
  parseMutation,
} from '@lister/shared/sync-protocol';
import { CLOCK, type Clock } from './clock';
import { type HandlerOutcome, mutationHandlers } from './mutation-handlers';

const { items, lists, processedMutations, spaces } = schema;

/** The answer to one pushed mutation. */
export type MutationResult =
  | { mutationId: string; status: 'ack'; version: number }
  | { mutationId: string; status: 'reject'; reason: string };

export interface AppliedMutation {
  result: MutationResult;
  /** The space whose rows changed (for the poke); null when nothing changed. */
  spaceId: string | null;
  /** The changed rows, at `result.version`. Empty when nothing changed or for a replay. */
  rows: RowSet;
}

export interface MutationContext {
  /** Who sent it (the dev user until T-025). */
  userId: string;
  clientId?: string;
}

const noRows = (): RowSet => ({ lists: [], items: [] });

type StoredResult = { version: number } | { reason: string };

/**
 * Applies pushed mutations, one synchronous SQLite transaction each (design §4.2):
 * replay → validate → authorize → apply → version + 1 → record. Never `await` in here: the
 * synchronous driver is what keeps mutations strictly ordered.
 */
@Injectable()
export class MutationService {
  constructor(
    private readonly database: DatabaseConnection,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** `entry` has a valid `mutationId` (the push envelope checked it); the rest is checked here. */
  apply(
    entry: { mutationId: string },
    context: MutationContext,
  ): AppliedMutation {
    return this.database.db.transaction((tx) => {
      const now = this.clock();
      const record = (spaceId: string, result: StoredResult) =>
        tx
          .insert(processedMutations)
          .values({
            mutationId: entry.mutationId,
            spaceId,
            clientId: context.clientId ?? null,
            result: JSON.stringify(result),
            createdAt: now,
          })
          .run();

      const previous = tx
        .select()
        .from(processedMutations)
        .where(eq(processedMutations.mutationId, entry.mutationId))
        .get();
      if (previous) {
        return {
          result: toResult(
            entry.mutationId,
            JSON.parse(previous.result) as StoredResult,
          ),
          spaceId: null,
          rows: noRows(),
        };
      }

      const rejectWith = (spaceId: string, reason: string): AppliedMutation => {
        record(spaceId, { reason });
        return {
          result: { mutationId: entry.mutationId, status: 'reject', reason },
          spaceId: null,
          rows: noRows(),
        };
      };

      const parsed = parseMutation(entry);
      const rawSpaceId = String((entry as { spaceId?: unknown }).spaceId ?? '');
      if (!parsed.ok) return rejectWith(rawSpaceId, parsed.reason);
      const mutation: Mutation = parsed.mutation;

      // Authorization: T-025 checks space membership here.
      const space = tx
        .select()
        .from(spaces)
        .where(eq(spaces.id, mutation.spaceId))
        .get();
      if (!space)
        return rejectWith(mutation.spaceId, "This space doesn't exist");

      const version = space.version + 1;
      const handler = mutationHandlers[mutation.name] as (
        ...args: Parameters<(typeof mutationHandlers)['list.delete']>
      ) => HandlerOutcome;
      const outcome = handler(
        { tx, spaceId: space.id, userId: context.userId, now, version },
        mutation.args as never,
      );

      if (outcome.kind === 'rejected')
        return rejectWith(space.id, outcome.reason);
      if (outcome.kind === 'unchanged') {
        // Nothing to do (e.g. a change to a deleted row: delete wins). Ack at the current version.
        record(space.id, { version: space.version });
        return {
          result: {
            mutationId: entry.mutationId,
            status: 'ack',
            version: space.version,
          },
          spaceId: null,
          rows: noRows(),
        };
      }

      tx.update(spaces).set({ version }).where(eq(spaces.id, space.id)).run();
      record(space.id, { version });
      const rows: RowSet = {
        lists: outcome.lists?.length
          ? tx
              .select()
              .from(lists)
              .where(inArray(lists.id, outcome.lists))
              .all()
          : [],
        items: outcome.items?.length
          ? tx
              .select()
              .from(items)
              .where(inArray(items.id, outcome.items))
              .all()
          : [],
      };
      return {
        result: { mutationId: entry.mutationId, status: 'ack', version },
        spaceId: space.id,
        rows,
      };
    });
  }
}

function toResult(mutationId: string, stored: StoredResult): MutationResult {
  return 'version' in stored
    ? { mutationId, status: 'ack', version: stored.version }
    : { mutationId, status: 'reject', reason: stored.reason };
}
