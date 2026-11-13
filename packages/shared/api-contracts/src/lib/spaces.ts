/** Limits for spaces, shared by the server and the forms. */
export const SPACE_LIMITS = { nameMax: 100 } as const;

export type SpaceRole = 'owner' | 'member';

/** A member of a space; clients only ever see display names, never accounts (design §3). */
export interface SpaceMember {
  userId: string;
  displayName: string;
  role: SpaceRole;
}

/** A space the signed-in user belongs to, as `GET /api/spaces` and the space routes return it. */
export interface SpaceSummary {
  id: string;
  name: string;
  /** The user's own space: it can't be deleted, left or shared. */
  personal: boolean;
  /** The signed-in user's role in it. */
  role: SpaceRole;
  /** The owner first, then the other members by name. */
  members: SpaceMember[];
}

/** Body of `POST /api/spaces`: creates a shared space owned by the caller. */
export interface CreateSpaceRequest {
  name: string;
}

/** Body of `PATCH /api/spaces/:id` (owner only). */
export interface RenameSpaceRequest {
  name: string;
}

/** Body of `POST /api/spaces/:id/members` (owner only): adds an existing user by username. */
export interface AddMemberRequest {
  /** Matched ignoring case, like sign-in. */
  username: string;
}
