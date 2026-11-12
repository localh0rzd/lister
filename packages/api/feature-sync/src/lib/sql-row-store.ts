import { eq } from 'drizzle-orm';
import { type Database, schema } from '@lister/api/data-access-db';
import type { Include, Item, List, Run, RunItem } from '@lister/shared/domain';
import type { RowStore } from '@lister/shared/sync-protocol';

const { includes, items, lists, runItems, runs } = schema;

/** A transaction handle (same API as the database). */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * The shared mutation rules' `RowStore` over a SQLite transaction (synchronous, like the rules).
 * Remembers which rows were written, so the poke can carry them.
 */
export class SqlRowStore implements RowStore {
  constructor(private readonly tx: Tx) {}

  getList(id: string): List | undefined {
    return this.tx.select().from(lists).where(eq(lists.id, id)).get();
  }

  getItem(id: string): Item | undefined {
    return this.tx.select().from(items).where(eq(items.id, id)).get();
  }

  getInclude(id: string): Include | undefined {
    return this.tx.select().from(includes).where(eq(includes.id, id)).get();
  }

  includesOf(parentListId: string): Include[] {
    return this.tx
      .select()
      .from(includes)
      .where(eq(includes.parentListId, parentListId))
      .all();
  }

  putList(row: List): void {
    this.tx
      .insert(lists)
      .values(row)
      .onConflictDoUpdate({ target: lists.id, set: row })
      .run();
  }

  putItem(row: Item): void {
    this.tx
      .insert(items)
      .values(row)
      .onConflictDoUpdate({ target: items.id, set: row })
      .run();
  }

  getRun(id: string): Run | undefined {
    return this.tx.select().from(runs).where(eq(runs.id, id)).get();
  }

  getRunItem(id: string): RunItem | undefined {
    return this.tx.select().from(runItems).where(eq(runItems.id, id)).get();
  }

  runItemsOf(runId: string): RunItem[] {
    return this.tx
      .select()
      .from(runItems)
      .where(eq(runItems.runId, runId))
      .all();
  }

  putRun(row: Run): void {
    this.tx
      .insert(runs)
      .values(row)
      .onConflictDoUpdate({ target: runs.id, set: row })
      .run();
  }

  putRunItem(row: RunItem): void {
    const value = { ...row, sources: [...row.sources] }; // a JSON column
    this.tx
      .insert(runItems)
      .values(value)
      .onConflictDoUpdate({ target: runItems.id, set: value })
      .run();
  }

  putInclude(row: Include): void {
    this.tx
      .insert(includes)
      .values(row)
      .onConflictDoUpdate({ target: includes.id, set: row })
      .run();
  }
}
