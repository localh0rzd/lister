import { v7 as uuidv7 } from 'uuid';
import type {
  CurrentUser,
  SpaceMember,
  SpaceSummary,
} from '@lister/shared/api-contracts';
import type {
  Include,
  IncludeException,
  Item,
  List,
  Run,
  RunItem,
  Space,
} from '@lister/shared/domain';

/**
 * Test-only factories for the shared object types. Each returns a complete, valid object and
 * takes a partial override. When a type gains a required field, give it a default here and no
 * spec needs to change.
 *
 * Only spec files and test helpers import this library (`npm run lint:workspace` checks it). It
 * imports types from `shared/domain` and `shared/api-contracts`, so those two projects' own specs
 * can't use it (dependency cycle) and keep local helpers.
 */

/** Space and user that the synced-row factories belong to unless a spec says otherwise. */
export const TEST_SPACE_ID = '0190a0a0-0000-7000-8000-000000000001';
export const TEST_USER_ID = '0190a0a0-0000-7000-8000-000000000002';

/** A new valid UUIDv7 (lower case), for rows that need a distinct id. */
const id = (): string => uuidv7();

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

export function makeUser(overrides: Partial<CurrentUser> = {}): CurrentUser {
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
  overrides: Partial<SpaceMember> = {},
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
  overrides: Partial<SpaceSummary> = {},
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

interface LocalSpaceMember {
  userId: string;
  displayName: string;
}

type LocalSpaceRow = Space & { members: LocalSpaceMember[] };

/**
 * A space row as the web app stores it (`LocalSpace`: the space plus the members `welcome` sent).
 * Typed structurally because shared code can't import the web type; it is assignable to it. Members
 * default to none and carry no role, unlike `makeSpaceSummary`'s.
 */
export function makeLocalSpace(
  overrides: Partial<LocalSpaceRow> = {},
): LocalSpaceRow {
  return {
    id: TEST_SPACE_ID,
    name: 'Home',
    version: 1,
    members: [],
    ...overrides,
  };
}

export function makeList(overrides: Partial<List> = {}): List {
  return {
    ...syncMetadata(),
    title: 'Camping',
    description: '',
    colour: null,
    icon: null,
    ...overrides,
  };
}

export function makeItem(overrides: Partial<Item> = {}): Item {
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

export function makeInclude(overrides: Partial<Include> = {}): Include {
  return {
    ...syncMetadata(),
    parentListId: id(),
    childListId: id(),
    position: 'a0',
    ...overrides,
  };
}

export function makeIncludeException(
  overrides: Partial<IncludeException> = {},
): IncludeException {
  return {
    ...syncMetadata(),
    includeId: id(),
    targetKind: 'item',
    targetId: id(),
    ...overrides,
  };
}

export function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    ...syncMetadata(),
    title: 'Weekend trip',
    sourceListId: null,
    finishedAt: null,
    ...overrides,
  };
}

export function makeRunItem(overrides: Partial<RunItem> = {}): RunItem {
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
