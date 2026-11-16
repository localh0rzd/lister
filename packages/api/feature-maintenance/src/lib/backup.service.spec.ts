import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import {
  type DatabaseConnection,
  openDatabase,
  schema,
  testDatabaseOptions,
} from '@lister/api/data-access-db';
import { BACKUPS_KEPT, BackupService } from './backup.service';

const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 0, 1, 3);

describe('BackupService', () => {
  let folder: string;
  let database: DatabaseConnection;
  let service: BackupService;

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'lister-backup-'));
    database = openDatabase(testDatabaseOptions(join(folder, 'lister.db')));
    service = new BackupService(database);
  });
  afterEach(() => {
    database.onApplicationShutdown();
    rmSync(folder, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('puts backups in a backups folder next to the database', () => {
    expect(service.directory).toBe(join(folder, 'backups'));
  });

  it('can be pointed elsewhere with BACKUP_DIR', () => {
    vi.stubEnv('BACKUP_DIR', join(folder, 'elsewhere'));
    expect(service.backup(START)).toBe(
      join(folder, 'elsewhere', 'lister-2026-01-01T03-00-00Z.db'),
    );
  });

  it('writes a consistent, openable copy of the database', () => {
    database.db.insert(schema.appMeta).values({ key: 'k', value: 'v' }).run();

    const path = service.backup(START);

    const copy = new BetterSqlite3(path, { readonly: true });
    expect(
      copy.prepare('select value from app_meta where key = ?').get('k'),
    ).toEqual({ value: 'v' });
    copy.close();
    expect(readdirSync(join(folder, 'backups'))).toEqual([
      'lister-2026-01-01T03-00-00Z.db',
    ]);
  });

  it('keeps the newest 14 backups and leaves other files alone', () => {
    const directory = join(folder, 'backups');
    for (let day = 0; day < BACKUPS_KEPT + 3; day++) {
      service.backup(START + day * DAY);
    }
    writeFileSync(join(directory, 'notes.txt'), 'mine');

    const names = service.list();
    expect(names).toHaveLength(BACKUPS_KEPT);
    expect(names[0]).toBe('lister-2026-01-04T03-00-00Z.db');
    expect(names.at(-1)).toBe('lister-2026-01-17T03-00-00Z.db');
    expect(existsSync(join(directory, 'notes.txt'))).toBe(true);
  });

  it('is due when the newest backup is from an earlier UTC day', () => {
    expect(service.isDue(START)).toBe(true);
    service.backup(START);
    expect(service.isDue(START + 3_600_000)).toBe(false);
    expect(service.isDue(START + DAY)).toBe(true);
  });

  it('does nothing for an in-memory database', () => {
    const memory = new BackupService(
      openDatabase(testDatabaseOptions(':memory:')),
    );
    expect(memory.directory).toBeUndefined();
    expect(memory.isDue(START)).toBe(false);
    expect(() => memory.backup(START)).toThrow();
  });
});
