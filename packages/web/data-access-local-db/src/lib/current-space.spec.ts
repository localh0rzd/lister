import { TestBed } from '@angular/core/testing';
import { newId } from '@lister/shared/domain';
import { CurrentSpace } from './current-space';
import { LOCAL_DB, LocalDb } from './local-db';

let db: LocalDb;
let current: CurrentSpace;

beforeEach(() => {
  db = new LocalDb(`test-${newId()}`);
  TestBed.configureTestingModule({
    providers: [{ provide: LOCAL_DB, useValue: db }],
  });
  current = TestBed.inject(CurrentSpace);
});
afterEach(async () => {
  TestBed.resetTestingModule();
  await db.delete();
});

const space = (name: string) => ({
  id: newId(),
  name,
  version: 0,
  members: [],
});

describe('CurrentSpace', () => {
  it('has no space before the first welcome', async () => {
    await vi.waitFor(() => {
      TestBed.tick();
      expect(current.state()).toEqual({ status: 'ready', value: undefined });
    });
    expect(current.id()).toBeUndefined();
  });

  it('picks the first space by name and follows changes', async () => {
    const home = space('Home');
    await db.spaces.bulkPut([space('Work'), home]);

    await vi.waitFor(() => {
      TestBed.tick();
      expect(current.id()).toBe(home.id);
    });

    const attic = space('Attic');
    await db.spaces.put(attic);
    await vi.waitFor(() => expect(current.id()).toBe(attic.id));
  });
});
