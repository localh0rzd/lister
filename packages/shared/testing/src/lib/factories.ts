import { v7 as uuidv7 } from 'uuid';
import type {
  CurrentUser,
  SpaceMember,
  SpaceSummary,
} from '@lister/shared/api-contracts';
import type { Include, Item, List, Run, RunItem } from '@lister/shared/domain';

/**
 * Test-only factories for the shared object types. Each returns a complete, valid object and
 * takes a partial override. When a type gains a required field, give it a default here and no
 * spec needs to change.
 *
 * Only spec files and test helpers import this library. It imports types only, so any
 * library's specs can use it without a dependency cycle.
 */

/** Space and user that the synced-row factories belong to unless a spec says otherwise. */
export const TEST_SPACE_ID = '0190a0a0-0000-7000-8000-000000000001';
export const TEST_USER_ID = '0190a0a0-0000-7000-8000-000000000002';

/** A new valid UUIDv7 (lower case), for rows that need a distinct id. */
const id = (): string => uuidv7();

/** Overrides: any field of `T`, all optional. */
type Overrides<T> = Partial<T>;

const syncMetadata = () => ({
  id: id(),
  spaceId: TEST_SPACE_ID,
  version: 1,
  deletedAt: null,
  createdBy: TEST_USER_ID,
  updatedBy: TEST_USER_ID,
  createdAt: 1000,
  updatedAt: 1000,
});

export function makeUser(overrides: Overrides<CurrentUser> = {}): CurrentUser {
  return {
    id: id(),
    username: 'anna',
    displayName: 'Anna',
    isAdmin: false,
    mustChangePassword: false,
    visibleToOthers: false,
    ...overrides,
  };
}

export function makeSpaceMember(
  overrides: Overrides<SpaceMember> = {},
): SpaceMember {
  return {
    userId: id(),
    displayName: 'Anna',
    role: 'owner',
    ...overrides,
  };
}

/** Members default to one owner, matching `role`; pass `members` to change that. */
export function makeSpaceSummary(
  overrides: Overrides<SpaceSummary> = {},
): SpaceSummary {
  const role = overrides.role ?? 'owner';
  return {
    id: id(),
    name: 'Family',
    personal: false,
    role,
    members: [makeSpaceMember({ role })],
    ...overrides,
  };
}

export function makeList(overrides: Overrides<List> = {}): List {
  return {
    ...syncMetadata(),
    title: 'Camping',
    description: '',
    colour: null,
    icon: null,
    ...overrides,
  };
}

export function makeItem(overrides: Overrides<Item> = {}): Item {
  return {
    ...syncMetadata(),
    listId: id(),
    title: 'Tent',
    quantity: '',
    note: '',
    position: 'a0',
    ...overrides,
  };
}

export function makeInclude(overrides: Overrides<Include> = {}): Include {
  return {
    ...syncMetadata(),
    parentListId: id(),
    childListId: id(),
    position: 'a0',
    ...overrides,
  };
}

export function makeRun(overrides: Overrides<Run> = {}): Run {
  return {
    ...syncMetadata(),
    title: 'Weekend trip',
    sourceListId: null,
    finishedAt: null,
    ...overrides,
  };
}

export function makeRunItem(overrides: Overrides<RunItem> = {}): RunItem {
  return {
    ...syncMetadata(),
    runId: id(),
    title: 'Tent',
    quantity: '',
    note: '',
    position: 'a0',
    sources: [],
    state: 'unchecked',
    stateBy: null,
    stateAt: null,
    mergedInto: null,
    ...overrides,
  };
}
