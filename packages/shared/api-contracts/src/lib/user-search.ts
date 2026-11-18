/** Rules for searching users to add to a space (design D27). */
export const USER_SEARCH = { minLength: 2, maxLength: 100, limit: 10 } as const;

/** Query of `GET /api/user-search`. */
export interface UserSearchQuery {
  /** The text to look for in usernames and display names. */
  q: string;
  /** The space the user is adding members to: its members aren't suggested. */
  spaceId?: string;
}

/** A user who chose to be found (D27), as `GET /api/user-search` returns them. */
export interface UserSuggestion {
  id: string;
  username: string;
  displayName: string;
}
