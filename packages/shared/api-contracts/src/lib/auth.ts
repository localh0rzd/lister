/** The signed-in user, as `GET /api/auth/me` and the sign-in responses return it. */
export interface CurrentUser {
  id: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
  /** Until the password is changed, every other endpoint answers 403 (design D9). */
  mustChangePassword: boolean;
}

/** Body of `POST /api/auth/login`. The username is matched ignoring case. */
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

/** Rules for usernames and passwords, shared by the server and the forms. */
export const AUTH_LIMITS = {
  usernameMax: 64,
  displayNameMax: 100,
  passwordMin: 8,
  passwordMax: 200,
} as const;
