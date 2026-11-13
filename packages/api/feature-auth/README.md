# @lister/api/feature-auth

Accounts, sessions and sign-in (design §2.3, D9, D15). The `users` and `sessions` tables are in
`@lister/api/data-access-db` (one Drizzle schema, one migration history).

- `AuthModule` registers a **global `AuthGuard`**: every HTTP route needs a session cookie
  unless it is `@Public()`. While the user must change their password, only
  `@AllowMustChangePassword()` routes work; `@AdminOnly()` routes need an admin (T-023 uses it).
  Read the caller with `@SignedInUser()` and `@SessionId()`.
- Routes: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`,
  `POST /api/auth/password`, `POST /api/auth/setup`.
- Passwords: `crypto.argon2` (argon2id, parameters stored in the hash, `password.ts`).
- Sessions: a random token in an httpOnly, SameSite=Lax cookie (`Secure` when `PUBLIC_URL` is
  https). Only the token's SHA-256 is stored. 90 days, renewed on use (at most once an hour).
  `AuthService.authenticate(token)` is what the socket handshake uses (`SyncIoAdapter`), and
  `isSessionActive()` is what the gateway re-checks on every message (`activeSessions()` for
  every poke).
- `AccountEvents` announces changes that open connections must act on at once, without this
  library depending on `feature-sync`: `sessionsEnded` (from `endSession`/`endSessionsOf`, so
  sign-out, password change and reset, and account deletion) and `membersChanged` (the co-members
  of a deleted user, or of one whose display name changed). `SyncGateway` subscribes.
- Setup: while no account exists, the server logs a one-time token at startup; `POST /auth/setup`
  with it creates the first admin. It lives in memory, so a restart logs a new one.
  `LISTER_SETUP_TOKEN` (16+ characters) fixes it instead, for the e2e suites; it is never logged.
- Rate limit: 10 failed sign-in, setup or password-change attempts per client in 15 minutes, then
  429 with `Retry-After`. `AttemptLimits.begin()` counts an attempt as a failure before the
  password check and takes it back when it succeeds, so parallel guesses can't outrun the limit.
  The client is `request.ip` (an IPv6 client's /64, see `clientKey`); `configureApp()` makes
  Express trust `X-Forwarded-For` from loopback and private addresses (Traefik), or whatever
  `TRUST_PROXY` says. In memory.
- A wrong current password on `POST /auth/password` is a 400, not a 401: the session is fine.
- Reset command, for when no admin can sign in (prints a random temporary password that must be
  changed at the next sign-in, and ends the user's sessions):
  `node dist/apps/lister-api/main.js reset-password <username>` (in the container:
  `docker exec <container> node main.js reset-password <username>`).

Environment: `PUBLIC_URL` (cookie `Secure`), `TRUST_PROXY` (optional: hop count or addresses).

Run the tests with `npx nx test api-feature-auth`; the routes are tested through the whole app in
`apps/lister-api/src/integration/auth.integration.spec.ts`.

Creating an account also creates its personal space; deleting one deletes it (and hands over or
deletes the shared spaces it owned) — `AuthService.createUser`, `UsersService.remove` (T-024).
