import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { DatabaseConnection, schema } from '@lister/api/data-access-db';
import {
  type Mutation,
  type RowSet,
  applyMutation,
  parseMutation,
} from '@lister/shared/sync-protocol';
import { CLOCK, type Clock } from './clock';
import { SqlRowStore } from './sql-row-store';

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

      const rejectWith = (reason: string): AppliedMutation => ({
        result: { mutationId: entry.mutationId, status: 'reject', reason },
        spaceId: null,
        rows: noRows(),
      });

      // A retry gets the stored answer, but only for the same space: an id reused elsewhere
      // must not borrow another space's answer. (From T-025 this runs after the membership
      // check, so non-members learn nothing.)
      const rawSpaceId = (entry as { spaceId?: unknown }).spaceId;
      const previous = tx
        .select()
        .from(processedMutations)
        .where(eq(processedMutations.mutationId, entry.mutationId))
        .get();
      if (previous) {
        if (previous.spaceId !== rawSpaceId) {
          return rejectWith('This change id was already used');
        }
        return {
          result: toResult(
            entry.mutationId,
            JSON.parse(previous.result) as StoredResult,
          ),
          spaceId: null,
          rows: noRows(),
        };
      }

      // Invalid input and unknown spaces aren't recorded: the same entry gives the same reason
      // again, and junk never reaches the table.
      const parsed = parseMutation(entry);
      if (!parsed.ok) return rejectWith(parsed.reason);
      const mutation: Mutation = parsed.mutation;

      // Authorization: T-025 checks space membership here.
      const space = tx
        .select()
        .from(spaces)
        .where(eq(spaces.id, mutation.spaceId))
        .get();
      if (!space) return rejectWith("This space doesn't exist");

      const version = space.version + 1;
      // The shared rules (also the client's prediction), over this transaction.
      const outcome = applyMutation(
        new SqlRowStore(tx),
        { spaceId: space.id, userId: context.userId, now, version },
        mutation,
      );

      if (outcome.kind === 'rejected') {
        record(space.id, { reason: outcome.reason });
        return rejectWith(outcome.reason);
      }
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
