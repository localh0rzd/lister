import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Database } from './database';
import * as schema from './schema';

type Tx = Pick<Database, 'insert' | 'delete' | 'select' | 'update'>;

/**
 * Creates a space and its owner's membership. Call it inside a synchronous transaction when the
 * rest of the change must stay atomic with it.
 */
export function insertSpace(
  db: Tx,
  input: { name: string; ownerId: string; personal: boolean; now: number },
): typeof schema.spaces.$inferSelect {
  const space = db
    .insert(schema.spaces)
    .values({
      id: randomUUID(),
      name: input.name,
      personal: input.personal,
      version: 0,
      createdAt: input.now,
    })
    .returning()
    .get();
  db.insert(schema.memberships)
    .values({
      spaceId: space.id,
      userId: input.ownerId,
      role: 'owner',
      createdAt: input.now,
    })
    .run();
  return space;
}

/**
 * Deletes a space for good: its lists, items, includes, runs and run items (tombstones too), its
 * mutation answers and its memberships. Synchronous, so call it inside a transaction.
 */
export function deleteSpace(db: Tx, spaceId: string): void {
  // Children first: the content tables have foreign keys to their parents and to the space.
  db.delete(schema.runItems).where(eq(schema.runItems.spaceId, spaceId)).run();
  db.delete(schema.runs).where(eq(schema.runs.spaceId, spaceId)).run();
  db.delete(schema.items).where(eq(schema.items.spaceId, spaceId)).run();
  db.delete(schema.includes).where(eq(schema.includes.spaceId, spaceId)).run();
  db.delete(schema.lists).where(eq(schema.lists.spaceId, spaceId)).run();
  db.delete(schema.processedMutations)
    .where(eq(schema.processedMutations.spaceId, spaceId))
    .run();
  // Memberships go with the space (`on delete cascade`).
  db.delete(schema.spaces).where(eq(schema.spaces.id, spaceId)).run();
}
