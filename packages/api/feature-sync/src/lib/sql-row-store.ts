import { eq } from 'drizzle-orm';
import { type Database, schema } from '@lister/api/data-access-db';
import type { Item, List } from '@lister/shared/domain';
import type { RowStore } from '@lister/shared/sync-protocol';

const { items, lists } = schema;

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
}
