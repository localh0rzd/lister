import { describe, expect, it } from 'vitest';
import {
  makeInclude,
  makeIncludeException,
  makeItem,
  makeList,
  makeLocalSpace,
  makeRun,
  makeRunItem,
  makeSpaceMember,
  makeSpaceSummary,
  makeUser,
  TEST_SPACE_ID,
} from './factories';

const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('factories', () => {
  it('give every call a fresh valid uuid v7 id', () => {
    const [a, b] = [makeList(), makeList()];

    expect(a.id).toMatch(UUID_V7);
    expect(b.id).toMatch(UUID_V7);
    expect(a.id).not.toBe(b.id);
    expect(makeUser().id).toMatch(UUID_V7);
    expect(makeSpaceSummary().id).toMatch(UUID_V7);
    expect(makeSpaceMember().userId).toMatch(UUID_V7);
  });

  it('apply overrides over the defaults', () => {
    expect(makeUser({ username: 'ben', visibleToOthers: true })).toMatchObject({
      username: 'ben',
      visibleToOthers: true,
      isAdmin: false,
    });
    expect(makeList({ deletedAt: 5 }).deletedAt).toBe(5);
    expect(makeRunItem({ state: 'checked' }).state).toBe('checked');
  });

  it('build synced rows in one space with valid references and positions', () => {
    const rows = [
      makeList(),
      makeItem(),
      makeInclude(),
      makeIncludeException(),
      makeRun(),
      makeRunItem(),
    ];

    for (const row of rows) {
      expect(row.spaceId).toBe(TEST_SPACE_ID);
      expect(row.id).toMatch(UUID_V7);
      expect(row.deletedAt).toBeNull();
    }
    expect(makeItem().listId).toMatch(UUID_V7);
    expect(makeInclude().parentListId).toMatch(UUID_V7);
    expect(makeInclude().childListId).toMatch(UUID_V7);
    expect(makeIncludeException().includeId).toMatch(UUID_V7);
    expect(makeRunItem().runId).toMatch(UUID_V7);
    expect(makeItem().position).toBe('a0');
  });

  it('give a local space the test space id and no members', () => {
    expect(makeLocalSpace({ name: 'Trips' })).toEqual({
      id: TEST_SPACE_ID,
      name: 'Trips',
      version: 1,
      members: [],
    });
  });

  it('give a space summary one member with the summary role', () => {
    const summary = makeSpaceSummary({ role: 'member' });

    expect(summary.members).toEqual([
      expect.objectContaining({ role: 'member' }),
    ]);
    expect(makeSpaceSummary({ members: [] }).members).toEqual([]);
  });
});
