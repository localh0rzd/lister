import { TestBed } from '@angular/core/testing';
import { newId } from '@lister/shared/domain';
import { makeLocalSpace } from '@lister/shared/testing';
import { CURRENT_SPACE_KEY, CurrentSpace } from './current-space';
import { LOCAL_DB, LocalDb } from './local-db';

let db: LocalDb;
let current: CurrentSpace;

beforeEach(() => {
  localStorage.removeItem(CURRENT_SPACE_KEY);
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

const space = (name: string) =>
  makeLocalSpace({ id: newId(), name, version: 0 });

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

  it('works in the space the user picked, and remembers it', async () => {
    const home = space('Home');
    const work = space('Work');
    await db.spaces.bulkPut([home, work]);
    await vi.waitFor(() => expect(current.id()).toBe(home.id));

    current.select(work.id);

    expect(current.id()).toBe(work.id);
    expect(localStorage.getItem(CURRENT_SPACE_KEY)).toBe(work.id);
  });

  it('starts in the remembered space, and falls back when it is gone', async () => {
    const home = space('Home');
    const work = space('Work');
    await db.spaces.bulkPut([home, work]);
    localStorage.setItem(CURRENT_SPACE_KEY, work.id);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: LOCAL_DB, useValue: db }],
    });
    const fresh = TestBed.inject(CurrentSpace);
    await vi.waitFor(() => expect(fresh.id()).toBe(work.id));

    await db.spaces.delete(work.id);

    await vi.waitFor(() => expect(fresh.id()).toBe(home.id));
  });

  it('names a member of any space on this device, not only the current one', async () => {
    const home = {
      ...space('Home'),
      members: [{ userId: 'anna', displayName: 'Anna' }],
    };
    const attic = space('Attic');
    await db.spaces.bulkPut([home, attic]);
    await vi.waitFor(() => expect(current.id()).toBe(attic.id));

    expect(current.memberName(home.id, 'anna')).toBe('Anna');
    expect(current.memberName(attic.id, 'anna')).toBeUndefined();
    expect(current.memberName(undefined, 'anna')).toBeUndefined();
  });
});
