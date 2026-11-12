import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { openDatabase } from './database';
import { appMeta } from './schema';
import { createTestDatabase, testDatabaseOptions } from './test-database';

describe('openDatabase', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lister-db-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const open = (path = join(dir, 'nested', 'lister.db')) =>
    openDatabase(testDatabaseOptions(path));

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

describe('openDatabase with drizzle-kit style migrations', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lister-migrations-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  /** Writes a migrations folder in drizzle-kit's format with the given SQL migrations. */
  function migrations(...sql: string[]) {
    const folder = join(dir, 'migrations');
    mkdirSync(join(folder, 'meta'), { recursive: true });
    const entries = sql.map((statements, idx) => {
      const tag = `000${idx}_m`;
      writeFileSync(join(folder, `${tag}.sql`), statements);
      return {
        idx,
        version: '6',
        when: 1700000000000 + idx,
        tag,
        breakpoints: true,
      };
    });
    writeFileSync(
      join(folder, 'meta', '_journal.json'),
      JSON.stringify({ version: '7', dialect: 'sqlite', entries }),
    );
    return folder;
  }

  const createParentAndChild = `CREATE TABLE \`lists\` (\`id\` text PRIMARY KEY NOT NULL);
--> statement-breakpoint
CREATE TABLE \`items\` (\`id\` text PRIMARY KEY NOT NULL, \`list_id\` text NOT NULL REFERENCES \`lists\`(\`id\`) ON DELETE cascade);`;

  // What drizzle-kit generates when a parent table must be rebuilt.
  const rebuildParent = `PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE \`__new_lists\` (\`id\` text PRIMARY KEY NOT NULL, \`title\` text DEFAULT '' NOT NULL);
--> statement-breakpoint
INSERT INTO \`__new_lists\`("id") SELECT "id" FROM \`lists\`;--> statement-breakpoint
DROP TABLE \`lists\`;--> statement-breakpoint
ALTER TABLE \`__new_lists\` RENAME TO \`lists\`;--> statement-breakpoint
PRAGMA foreign_keys=ON;`;

  it('keeps child rows when a migration rebuilds their parent table', () => {
    const path = join(dir, 'lister.db');
    const first = openDatabase({
      path,
      migrationsFolder: migrations(createParentAndChild),
    });
    first.sqlite.exec(
      "insert into lists values ('l1'); insert into items values ('i1', 'l1'), ('i2', 'l1');",
    );
    first.onApplicationShutdown();

    const second = openDatabase({
      path,
      migrationsFolder: migrations(createParentAndChild, rebuildParent),
    });
    onTestFinished(() => second.onApplicationShutdown());

    const count = (table: string) =>
      (
        second.sqlite.prepare(`select count(*) as n from ${table}`).get() as {
          n: number;
        }
      ).n;
    expect(count('lists')).toBe(1);
    expect(count('items')).toBe(2);
    expect(second.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('refuses to start when migrations leave broken foreign keys', () => {
    const folder = migrations(
      createParentAndChild,
      "INSERT INTO `items` VALUES ('orphan', 'missing');",
    );

    expect(() =>
      openDatabase({ path: join(dir, 'broken.db'), migrationsFolder: folder }),
    ).toThrow(/broken foreign keys: items → lists/);
  });

  it('rejects an empty path instead of using a throwaway database', () => {
    expect(() =>
      openDatabase({ path: ' ', migrationsFolder: migrations() }),
    ).toThrow(/empty/);
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
