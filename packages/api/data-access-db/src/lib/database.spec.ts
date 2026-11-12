import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { openDatabase } from './database';
import { appMeta } from './schema';
import { SOURCE_MIGRATIONS_FOLDER, createTestDatabase } from './test-database';

describe('openDatabase', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lister-db-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const open = (path = join(dir, 'nested', 'lister.db')) =>
    openDatabase({ path, migrationsFolder: SOURCE_MIGRATIONS_FOLDER });

  it('creates the folder and file, with Lister’s pragmas', () => {
    const path = join(dir, 'nested', 'lister.db');
    const connection = open(path);
    onTestFinished(() => connection.onApplicationShutdown());

    expect(existsSync(path)).toBe(true);
    const pragma = (name: string) =>
      connection.sqlite.pragma(name, { simple: true });
    expect(pragma('journal_mode')).toBe('wal');
    expect(pragma('foreign_keys')).toBe(1);
    expect(pragma('busy_timeout')).toBe(5000);
    expect(pragma('synchronous')).toBe(1); // NORMAL
  });

  it('applies the migrations once and keeps data across restarts', () => {
    const first = open();
    first.db.insert(appMeta).values({ key: 'k', value: 'v' }).run();
    first.onApplicationShutdown();

    const second = open();
    onTestFinished(() => second.onApplicationShutdown());
    expect(
      second.db.select().from(appMeta).where(eq(appMeta.key, 'k')).all(),
    ).toEqual([{ key: 'k', value: 'v' }]);
    const applied = second.sqlite
      .prepare('select count(*) as n from __drizzle_migrations')
      .get() as { n: number };
    expect(applied.n).toBeGreaterThan(0);
  });

  it('reports health, and closes on shutdown', () => {
    const connection = open();
    expect(connection.isHealthy()).toBe(true);

    connection.onApplicationShutdown();

    expect(connection.sqlite.open).toBe(false);
    expect(connection.isHealthy()).toBe(false);
    connection.onApplicationShutdown(); // a second shutdown is harmless
  });
});

describe('createTestDatabase', () => {
  it('gives every test its own migrated in-memory database', () => {
    const a = createTestDatabase();
    const b = createTestDatabase();
    onTestFinished(() => {
      a.onApplicationShutdown();
      b.onApplicationShutdown();
    });

    a.db.insert(appMeta).values({ key: 'only-in-a', value: '1' }).run();

    expect(a.db.select().from(appMeta).all()).toHaveLength(1);
    expect(b.db.select().from(appMeta).all()).toEqual([]);
  });
});
