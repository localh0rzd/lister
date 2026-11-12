/** The signed-in user, as `GET /api/auth/me` and the sign-in responses return it. */
export interface CurrentUser {
  id: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
  /** Until the password is changed, every other endpoint answers 403 (design D9). */
  mustChangePassword: boolean;
}

/** Body of `POST /api/auth/login`. The username is matched ignoring case (see `USERNAME_PATTERN`). */
export interface LoginRequest {
  username: string;
  password: string;
}

/** Body of `POST /api/auth/setup`: creates the first account, an admin. */
export interface SetupRequest {
  /** The one-time token the server logged at startup. */
  token: string;
  username: string;
  displayName: string;
  password: string;
}

/** Body of `POST /api/auth/password`. */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/**
 * Usernames: ASCII letters (any case), digits, `.`, `_` and `-`, matched ignoring case. Display
 * names may use any characters. ASCII only, because case-insensitive matching (SQLite's `lower()`)
 * only folds ASCII letters.
 */
export const USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/;

/** Rules for usernames and passwords, shared by the server and the forms. */
export const AUTH_LIMITS = {
  usernameMax: 64,
  displayNameMax: 100,
  passwordMin: 8,
  passwordMax: 200,
} as const;
