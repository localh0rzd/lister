import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  type DatabaseConnection,
  createTestDatabase,
  insertSpace,
  schema,
} from '@lister/api/data-access-db';
import { SpacesService } from './spaces.service';

describe('SpacesService', () => {
  let database: DatabaseConnection;
  let service: SpacesService;

  beforeEach(() => {
    database = createTestDatabase();
    service = new SpacesService(database);
  });
  afterEach(() => database.onApplicationShutdown());

  const addUser = (id: string, username: string, displayName = username) => {
    database.db
      .insert(schema.users)
      .values({
        id,
        username,
        displayName,
        passwordHash: 'x',
        createdAt: 1,
      })
      .run();
    return id;
  };
  const ANNA = '0197f000-0000-7000-8000-0000000000a1';
  const BEN = '0197f000-0000-7000-8000-0000000000b1';
  const CARL = '0197f000-0000-7000-8000-0000000000c1';
  beforeEach(() => {
    addUser(ANNA, 'anna', 'Anna');
    addUser(BEN, 'ben', 'Ben');
    addUser(CARL, 'carl', 'Carl');
  });

  it('puts the owner first, then members by name', () => {
    const space = service.create(ANNA, 'Family');
    service.addMember(ANNA, space.id, 'carl');
    const added = service.addMember(ANNA, space.id, 'ben');

    expect(added.members.map((m) => [m.displayName, m.role])).toEqual([
      ['Anna', 'owner'],
      ['Ben', 'member'],
      ['Carl', 'member'],
    ]);
  });

  it('keeps the owner when a member would sort before them', () => {
    addUser('0197f000-0000-7000-8000-0000000000d1', 'abe', 'Abe');
    const space = service.create(BEN, 'Crew');

    const after = service.addMember(BEN, space.id, 'abe');

    expect(after.members.map((m) => m.displayName)).toEqual(['Ben', 'Abe']);
  });

  it('treats a space the user is not in as missing, and a member as forbidden', () => {
    const space = service.create(ANNA, 'Family');
    service.addMember(ANNA, space.id, 'ben');

    expect(() => service.rename(CARL, space.id, 'x')).toThrow(
      NotFoundException,
    );
    expect(() => service.rename(BEN, space.id, 'x')).toThrow(
      ForbiddenException,
    );
  });

  it('refuses to share a personal space and to delete it', () => {
    const personal = insertSpace(database.db, {
      name: 'Anna',
      ownerId: ANNA,
      personal: true,
      now: 1,
    });

    expect(() => service.addMember(ANNA, personal.id, 'ben')).toThrow(
      ConflictException,
    );
    expect(() => service.remove(ANNA, personal.id)).toThrow(ConflictException);
  });

  it('refuses a duplicate member and removing or leaving as the owner', () => {
    const space = service.create(ANNA, 'Family');
    service.addMember(ANNA, space.id, 'ben');

    expect(() => service.addMember(ANNA, space.id, 'BEN')).toThrow(
      ConflictException,
    );
    expect(() => service.removeMember(ANNA, space.id, ANNA)).toThrow(
      ConflictException,
    );
    expect(() => service.leave(ANNA, space.id)).toThrow(ConflictException);
  });

  it('removes a member and lets another member leave', () => {
    const space = service.create(ANNA, 'Family');
    service.addMember(ANNA, space.id, 'ben');
    service.addMember(ANNA, space.id, 'carl');

    service.removeMember(ANNA, space.id, BEN);
    service.leave(CARL, space.id);

    expect(service.list(ANNA)[0].members.map((m) => m.userId)).toEqual([ANNA]);
    expect(service.list(BEN)).toEqual([]);
    expect(service.list(CARL)).toEqual([]);
  });
});
