/** The signed-in user, as `GET /api/auth/me` and the sign-in responses return it. */
export interface CurrentUser {
  id: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
  /** Until the password is changed, every other endpoint answers 403 (design D9). */
  mustChangePassword: boolean;
  /** Others can find the user when adding members to a space (D27). */
  visibleToOthers: boolean;
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

/** Body of `PATCH /api/auth/me`: the signed-in user edits their own profile. Omitted fields stay. */
export interface UpdateProfileRequest {
  displayName?: string;
  visibleToOthers?: boolean;
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

/** Body of `POST /api/users` (admins only): creates an account with a temporary password. */
export interface CreateUserRequest {
  username: string;
  displayName: string;
  /** The user must change it at their first sign-in (design D9). */
  temporaryPassword: string;
}

/** Body of `PATCH /api/users/:id` (admins only). Omitted fields stay as they are. */
export interface UpdateUserRequest {
  username?: string;
  displayName?: string;
  /** Grants or revokes admin. The last admin can't be demoted. */
  isAdmin?: boolean;
}

/** Body of `POST /api/users/:id/password` (admins only): sets a new temporary password. */
export interface ResetPasswordRequest {
  temporaryPassword: string;
}

/** Registration tokens: 12 characters, A–Z and 0–9 (design D23). */
export const REGISTRATION_TOKEN_LENGTH = 12;

/** Registration tokens expire this long after they were created (D23). */
export const REGISTRATION_TOKEN_LIFETIME_DAYS = 7;

/**
 * The canonical form of a registration token a person typed or pasted: surrounding spaces gone,
 * upper case. Both the form and the server use it, so the token is accepted ignoring case.
 */
export function normalizeRegistrationToken(input: string): string {
  return input.trim().toUpperCase();
}

/** Whether `input`, once normalized, looks like a registration token. */
export function isRegistrationToken(input: string): boolean {
  return (
    /^[A-Z0-9]+$/.test(normalizeRegistrationToken(input)) &&
    normalizeRegistrationToken(input).length === REGISTRATION_TOKEN_LENGTH
  );
}

/** The link an admin hands out: `<base>/register?token=<TOKEN>`. `base` is an origin. */
export function registrationLink(base: string, token: string): string {
  return `${base.replace(/\/+$/, '')}/register?${new URLSearchParams({ token })}`;
}

/** Body of `POST /api/auth/register`: like setup, but with a registration token; makes a regular user. */
export interface RegisterRequest {
  /** Accepted ignoring case and surrounding spaces. */
  token: string;
  username: string;
  displayName: string;
  password: string;
}

/** One unused, unexpired registration token, as admins see it. Dates are ISO strings. */
export interface RegistrationToken {
  token: string;
  createdAt: string;
  /** Display name of the admin who created it. */
  createdBy: string;
  expiresAt: string;
}

/** Response of `GET /api/registration-tokens` (admins only). */
export interface RegistrationTokenList {
  /** `PUBLIC_URL` (an origin); `null` when unset, and links then use the page's own origin. */
  publicUrl: string | null;
  tokens: RegistrationToken[];
}
