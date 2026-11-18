import Dexie, { type EntityTable } from 'dexie';
import {
  type DiagnosticEntry,
  MAX_AGE_MS,
  MAX_ENTRIES,
} from './diagnostic-entry';

/**
 * The log's own IndexedDB database, apart from the app's data: signing out wipes that one, and a
 * problem there must not hide the log. Loaded lazily (`Diagnostics`), so Dexie stays out of the
 * initial bundle.
 */
class DiagnosticDb extends Dexie {
  readonly entries!: EntityTable<DiagnosticEntry, 'id'>;

  constructor() {
    super('lister-diagnostics');
    this.version(1).stores({ entries: '++id, at' });
  }
}

/** Reads and writes the persisted log. */
export class DiagnosticStore {
  private readonly db = new DiagnosticDb();

  /** Appends entries, then drops the oldest beyond the size and age bounds. */
  async append(
    entries: readonly DiagnosticEntry[],
    now = Date.now(),
  ): Promise<void> {
    await this.db.entries.bulkAdd([...entries]);
    await this.prune(now);
  }

  async prune(now = Date.now()): Promise<void> {
    await this.db.entries
      .where('at')
      .below(now - MAX_AGE_MS)
      .delete();
    const surplus = (await this.db.entries.count()) - MAX_ENTRIES;
    if (surplus <= 0) return;
    const oldest = await this.db.entries
      .orderBy('id')
      .limit(surplus)
      .primaryKeys();
    await this.db.entries.bulkDelete(oldest);
  }

  /** Every entry, oldest first. */
  async all(): Promise<DiagnosticEntry[]> {
    const entries = await this.db.entries.toArray();
    return entries.sort((a, b) => a.at - b.at || (a.id ?? 0) - (b.id ?? 0));
  }

  count(): Promise<number> {
    return this.db.entries.count();
  }

  async clear(): Promise<void> {
    await this.db.entries.clear();
  }

  close(): void {
    this.db.close();
  }
}
