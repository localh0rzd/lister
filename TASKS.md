# Lister — Tasks

Backlog for Lister. Claude picks tasks up with the `tasks` skill ("work on the next task", "do T-007").
The design behind them is [docs/design.md](docs/design.md). Ideas deliberately left out of v1 are in
its §8; decisions still open are under its **Open decisions**.

How to write a task:

- Give it the next free ID (highest existing ID + 1) and a short title.
- Say what should be true when it's done, from the user's point of view. Bullets are fine.
- Fields: `Milestone:`, `Area:` (web / api / shared / infra), `Priority:` (high / normal / low),
  `Depends on:` T-xxx, `Decisions:` open decisions from `docs/design.md` it needs, `Notes:`.
- Order the backlog by priority — the top unblocked task is "next".

Statuses: tasks move **Backlog → In progress → Done**. Claude moves them, commits each task on
`work/v1`, has a separate session review it, and closes it with a one-line summary once the
review is resolved. Anything blocked or needing a decision goes back with a `Blocked:` note.

Milestones: **M1** Foundations · **M2** Sync walking skeleton · **M3** Composition · **M4** Runs ·
**M5** Accounts and spaces · **M6** Collaboration polish · **M7** Deployment · **M8** Editing conveniences

---

## In progress

### T-048 — Paste items into the new-list dialog

- Milestone: M8 Editing conveniences
- Area: web, shared, api
- Priority: normal
- Depends on: T-011
- Decisions: D18
- Done when:
  - The "New list" dialog has an optional multi-line "Items (one per line)" field under the title.
  - Creating the list with pasted text creates the list and one item per remaining line, in the
    pasted order, cleaned up as D18 says (trimmed, blank lines dropped, bullet and checkbox
    markers removed, identical lines added once).
  - It works offline and syncs as one change: other members see the list arrive with all its
    items at once, and a rejection rolls back the list and its items together.
  - A paste over the item limit (the same cap as `list.duplicate`) is refused in the dialog with a
    clear message, not by the server.
  - Leaving the field empty behaves exactly as today.
- Notes: Prefer extending `list.create` with an optional `items` array (as `list.duplicate`
  carries them) over sending one `item.create` per line. The line cleanup is a pure function in
  `shared/domain`, unit-tested. Clients send it; the server re-validates titles as for
  `item.create`.

## Backlog

### T-049 — Sort items A–Z in lists and runs

- Milestone: M8 Editing conveniences
- Area: web, shared, api
- Priority: normal
- Depends on: T-016, T-020
- Decisions: D17
- Done when:
  - The list editor has a "Sort A–Z" action. It sorts the list's own items in list-title order
    (ignoring case and accents, numbers by value); included lists keep their slots. It shows
    Undo in the snackbar, and Undo restores the previous order.
  - Each included list's section in the editor has its own "Sort A–Z", which sorts that list
    itself; the new order shows in every list that includes it.
  - A run has a "Sort A–Z" action that sorts the items within each section, with Undo.
  - The add-item field in the list editor and on the run page has a choice, "Add at end" /
    "Sort in", remembered on the device (default: at end). "Sort in" places the new item before
    the first item, in the same list (or run section), that sorts after it.
  - Sorting works offline and syncs as one change. Other members see the new order, and an item
    added or moved concurrently elsewhere still appears exactly once.
- Notes: One mutation per sort (e.g. `list.sortItems` / `run.sortItems`) that **sets** explicit
  positions for the given ids, so it stays idempotent (mutations set values). Positions come from
  `fractional-indexing` and are assigned to the item slots only, so includes keep theirs. The
  comparison is the existing list-title collator, moved or exported from `shared/domain` if
  needed. Undo sends the previous positions back with the same mutation.

## Done

### T-037 — Quiet the sync-engine test teardown

- Completed: 2026-11-16 — `SyncEngine.stop()` cancels watchers, timers and the socket and skips queued background work; tests stop the engine before closing the database, so the suite logs no `DatabaseClosedError` (`web-data-access-sync`).
- Review: Changes requested; 3 fixed (2 substantive, 1 trivial), 0 skipped, 0 disagreed; re-review rounds: 1
- Milestone: M6 Collaboration polish
- Area: web
- Priority: low
- Depends on: T-013
- Done when:
  - `npx nx test web-data-access-sync` logs no `DatabaseClosedError`: no engine work is still
    running when a test closes its Dexie database.
- Notes: found in the T-013 review. Awaiting `engine.whenIdle()` in `afterEach` made 11 tests
  fail, so the engine probably needs a `stop()` that cancels its watchers and timers first.

### T-041 — Say which change a sync error refers to

- Completed: 2026-11-16 — refused changes are stored with a description (`Rejection.description`, written by `SyncEngine.onReject`); the Space page's sync errors and the refusal snackbar show "<change> — <reason>" via `rejectionText()`; older entries still show their reason.
- Review: Changes requested (0 blocker, 1 major, 2 minor, 0 nit); 3 fixed (3 substantive, 0 trivial), 0 skipped, 0 disagreed; re-review rounds: 1
- Milestone: M6 Collaboration polish
- Area: web
- Priority: low
- Depends on: T-030
- Done when:
  - Each entry in the Space page's "Sync errors" list names the refused change, e.g. "Add item
    “Stove” to Camping — Item not found", not only the reason.
  - The refusal snackbar uses the same wording.
  - Entries recorded before the change still show their reason.
- Notes: Needs a short description stored with each refusal (`Rejection` in `data-access-local-db`,
  written by `SyncEngine` when it records the reject), probably in `data-access-sync` and
  `feature-space`. Found in the T-030 review (finding 5).

### T-040 — Pin CI actions to commit hashes

- Milestone: M7 Deployment
- Area: infra
- Priority: low
- Done when:
  - Every `uses:` in `.github/workflows/` names a full commit SHA with the version as a comment
    (`actions/checkout@<sha> # v5`), so a moved or hijacked tag can't change what CI runs.
  - Dependabot (`.github/dependabot.yml`, `github-actions` ecosystem) proposes updates to the
    pinned hashes.
- Notes: Found in the security audit (2026-11-13), rated low: CI has no deploy secrets today.
- Completed: 2026-11-16 — all `uses:` in `.github/workflows/ci.yml` pinned to commit SHAs with exact release comments; `.github/dependabot.yml` (github-actions, weekly, 7-day cooldown)
- Review: Approve with minor fixes; 2 fixed (0 substantive, 2 trivial), 0 skipped, 0 disagreed; re-review rounds: 0

### T-036 — Slim the sync engine chunk

- Milestone: M7 Deployment
- Area: web
- Priority: low
- Done when:
  - The lazily loaded sync-engine chunk is well under its 589 kB raw / 123 kB transferred size
    from T-009 (mostly Zod 4 classic), e.g. by validating on the client with `zod/mini` or by
    sharing only the types and parsing server messages more cheaply. The server keeps full
    validation.
  - The initial bundle stays within its budget, and a check (budget or test) catches regressions.
- Completed: 2026-11-16 — shared sync-protocol schemas moved to `zod/mini` (sync chunk 499 → ~103 kB raw), `anyScript` budget, classic `zod` banned in shared libs
- Review: Changes requested; 4 fixed (2 substantive, 2 trivial), 0 skipped, 0 disagreed; re-review rounds: 1
- Notes: Found in T-009. Mobile users download the chunk on the first visit.

### T-047 — Per-space timeline id so a restore always makes every device snapshot

- Completed: 2026-11-16 — per-space `timeline` id (migration 0009, Dexie v7, protocol 2) that `restore-backup` replaces; a pull naming another timeline is always a snapshot; README and design §2.9/§4.2 updated
- Review: Changes requested; 3 fixed (2 substantive, 1 trivial), 0 skipped, 0 disagreed; re-review rounds: 1
- Milestone: M7 Deployment
- Area: api
- Priority: low
- Depends on: T-046
- Done when:
  - A space carries a timeline id that `restore-backup` changes; a device whose pull names another
    timeline always gets a snapshot, also in the case where a space deleted after the backup had
    out-versioned every other space and the device was offline across both the deletion and the
    restore.
  - Tests cover that case; the README and design §2.9 no longer list it as a limitation.
- Notes: found in the T-046 review (question for the user, recorded here instead of asked).

### T-034 — Subset the Material Symbols font

- Completed: 2026-11-16 — Subset icon font (5 kB instead of 4 MB): `nx run lister-web:subset-icons` (tools/subset-material-symbols.mjs), `lint:workspace` check, e2e glyph check, service worker prefetches the subset
- Review: Changes requested; 5 fixed (3 substantive, 2 trivial), 0 skipped, 0 disagreed; re-review rounds: 1
- Milestone: M7 Deployment
- Area: web
- Priority: low
- Depends on: T-003
- Done when:
  - The app ships an icon font that contains only the glyphs it uses, instead of the full 4 MB
    `material-symbols-outlined.woff2`, generated by a documented Nx target from the list of
    icons in use.
  - A check (lint or test) fails when the code uses an icon that the subset lacks.
  - The service worker prefetch stays small; the app still makes no requests to Google Fonts.
- Notes: Found in T-001. Until then the full variable font is bundled.

### T-031 — Install hint and persistent storage

- Completed: 2026-11-16 — Space page App section: Install app (Chromium prompt), one-time iOS hint, persistent storage requested after first sync (util-pwa, feature-space, lister-web)
- Review: Changes requested; 6 fixed (3 substantive, 3 trivial), 0 skipped, 0 disagreed; re-review rounds: 1
- Milestone: M6 Collaboration polish
- Area: web
- Priority: low
- Depends on: T-003
- Done when:
  - On Chromium, an "Install app" action opens the browser's install prompt.
  - On iOS Safari, a one-time hint explains "Share → Add to Home Screen".
  - After the first real use, the app requests persistent storage (`navigator.storage.persist()`),
    and the Space page shows whether it was granted.

### T-045 — Reset the run-page checkbox when a change doesn't show in the data

- Completed: 2026-11-16 — run page resets the checkbox from the local data after a change resolves (`packages/web/feature-runs` `run-page.ts`/`.html`); unit test for the refused case.
- Review: Changes requested; 2 fixed (1 substantive, 1 trivial), 0 skipped, 0 disagreed; re-review rounds: 1. Known limit: a run-finishing check reverted within milliseconds can leave the box as clicked until the next change.

- Milestone: M6 Collaboration polish
- Area: web
- Priority: low
- Done when:
  - On the run page, a checkbox never stays checked (or unchecked) while the run's data and the
    progress text say otherwise: e.g. a click whose local change never shows (two quick changes
    that merge, or a change the prediction refuses before writing anything, such as on a run
    finished elsewhere) puts the checkbox back to what the data says.
  - A unit test covers the refused-prediction case; the merged case is already covered by
    T-043's test.
- Notes: found in the T-043 review. `[checked]` is a one-way binding, so when the local row never
  changes the binding value doesn't change and `MatCheckbox` keeps the state the click gave it.
  Unverified in the app for the refusal path. Idea: reset the checkbox from the data when
  `apply()` resolves without the local row changing.

### T-046 — `restore-backup` command

- Completed: 2026-11-16 — `node main.js restore-backup <file>` (`api-feature-maintenance`): migrates a copy of the backup, moves every space's version and purge point past both timelines, ends all sessions, refuses while the server has the database open, then swaps it in; README and design §2.9 updated
- Review: Changes requested; 5 fixed (4 substantive, 1 trivial), 0 skipped, 0 disagreed; re-review rounds: 1
- Milestone: M7 Deployment
- Area: api
- Priority: normal
- Depends on: T-033
- Done when:
  - `node main.js restore-backup <file>` (like `reset-password`) copies a backup over the database
    and sets every space's `version` and `purged_version` above both the backup's and what the
    server had issued before the restore, so every device pulls a snapshot and versions are never
    reused.
  - Spaces created after the backup are gone; a test covers the command with a backup older than
    the live database, and a device whose version passed the backup's again still converges.
  - The README restore section uses the command and no longer needs the sign-out workaround.
- Notes: found in the T-033 review. Without it a device that was offline at version 140 while the
  restored space (backup at 100, server had reached 150) reaches 160 pulls incrementally and keeps
  the lost timeline's rows 101–140.

### T-033 — Backups and purge

- Completed: 2026-11-16 — new `api-feature-maintenance` library: nightly `VACUUM INTO` backups (newest 14 kept) and a daily purge of tombstones and finished runs; `spaces.purged_version` makes older clients (and, after a purge, every client of the space) pull a snapshot; README documents restoring
- Review: Changes requested; 7 fixed (2 substantive, 5 trivial), 1 skipped (T-046), 0 disagreed; re-review rounds: 1
- Milestone: M7 Deployment
- Area: api
- Priority: normal
- Depends on: T-017, T-032
- Done when:
  - Nightly backups with `VACUUM INTO` go to `/data/backups`; the last 14 are kept (D15).
  - Tombstones and finished runs older than 30 days (D15) are purged daily, and each space
    remembers its purge point.
  - A client whose last version is older than the purge point gets a full snapshot on pull
    (integration test).
  - Restoring from a backup is documented.

### T-032 — Docker image for running behind Traefik

- Completed: 2026-11-16 — Dockerfile (multi-stage, non-root, `/data` volume, health check), security headers and CSP on every response (`security-headers.ts`, Angular `autoCsp`), README with Traefik compose example and env vars
- Review: Changes requested; 6 fixed (3 substantive, 3 trivial), 0 skipped, 0 disagreed; re-review rounds: 1. linux/arm64 was built via buildx without emulation but never run.
- Milestone: M7 Deployment
- Area: infra
- Priority: normal
- Depends on: T-012
- Done when:
  - A multi-stage Dockerfile builds web and API. The image runs as a non-root user, listens on
    plain HTTP (`PORT`), keeps the database at `DATABASE_PATH=/data/lister.db` on a volume, and has
    a health check.
  - The API trusts Traefik's `X-Forwarded-*` headers, and `PUBLIC_URL` drives the `Origin` check,
    `Secure` cookies and the passkey relying party.
  - The README has an example `docker-compose.yml` with Traefik labels (router, entrypoint, TLS)
    and lists every environment variable.
  - The image builds for linux/amd64 and linux/arm64.
  - The served app sends a Content Security Policy (design §2.9). Inline scripts, such as the
    theme script in `index.html`, are allowed by hash (Angular's `security.autoCsp`) or moved
    out.
  - Security headers on every response, static files included (register them **before**
    `serveWebApp()`, whose Express middleware runs ahead of Nest's): `X-Content-Type-Options:
nosniff`, `Referrer-Policy`, `frame-ancestors` in the CSP, and `app.disable('x-powered-by')`
    (T-012 review).
- Notes: TLS stays in Traefik (D4); the app never handles certificates.

### T-044 — Stop axe contrast checks failing during animations

- Completed: 2026-11-16 — `expectAccessible` waits for finite animations/transitions to end before axe (`apps/lister-web-e2e/src/support/fixtures.ts`); admin spec waits for the dialog
- Review: Approve with minor fixes; 2 fixed (1 substantive, 1 trivial), 0 skipped, 0 disagreed; re-review rounds: 1
- Milestone: M6 Collaboration polish
- Area: web
- Priority: normal
- Done when:
  - `expectAccessible` in the web e2e fixtures runs only once dialogs and form-field labels have
    finished animating (wait for animations to end, or disable them in e2e), so the
    `color-contrast` rule no longer fails at random.
  - `admin.spec.ts` (add-user dialog) and `passkeys.spec.ts` (passkey hint, remove dialog) pass
    several runs in a row.
- Notes: Found in the T-042 review: the failures also happen without T-042's changes and passed on
  an earlier run.

### T-043 — Fix the failing run-page "undone check" test

- Completed: 2026-11-16 — Fixed the racy "undone check" spec (waits for the page to show the local data) and the real bug it exposed: a sent state is dropped once the local row shows another state or another `stateAt` (`web-feature-runs`).
- Review: Approve with minor fixes; 1 fixed (1 substantive, 0 trivial), 0 skipped, 0 disagreed; re-review rounds: 1
- Milestone: M4 Runs
- Area: web
- Priority: normal
- Done when:
  - `web-feature-runs` `run-page.spec.ts` › "does not count a check made here once someone else
    has undone it" passes reliably, and the behaviour it describes is confirmed in the app (or the
    test is corrected if its expectation is wrong).
  - `npx nx test web-feature-runs` is green.
- Notes: Found in the T-042 review: fails every time (`expected true to be false`), unchanged since
  T-029. It only shows up in `affected` runs against `master`.

### T-042 — Fix passkey cancel and stale "session ended" notice

- Completed: 2026-11-16 — Passkey ceremonies stop waiting once cancelled (`untilAborted`); a delayed "Waiting for your passkey…" hint next to Cancel, since KeePassXC holds its answer back for the whole timeout after its dialog is dismissed; signing in and changing the password forget the stale sync status; neutral `NotAllowedError` text (`data-access-auth`, `feature-auth`).
- Review: Changes requested; 3 fixed (3 substantive, 0 trivial), 0 skipped, 0 disagreed; re-review rounds: 1
- Milestone: M5 Accounts and spaces
- Area: web
- Priority: high
- Done when:
  - On the Profile page, cancelling the browser's passkey dialog while adding a passkey brings
    the "Add a passkey" button back at once (no "Cancel" left behind), and a new attempt works.
    The same holds when the authenticator, the browser or an extension (e.g. KeePassXC) rejects,
    or when the request fails. The sign-in page's "Sign in with a passkey" behaves the same.
  - After a successful sign-in (password or passkey) no "Your session has ended. Sign in to
    sync your changes; nothing is lost." snackbar appears. It still appears when a session
    really ends while signed in.
  - When the browser refuses a ceremony without the user cancelling, the message doesn't
    claim the user cancelled it.
  - Tests: unit tests for each fix, and Playwright cases for a cancelled/refused passkey add and
    sign-in (virtual authenticator with `isUserVerified: false`, or a stubbed
    `navigator.credentials` that rejects with `NotAllowedError`), plus a check that no
    session-ended snackbar shows after signing in.
- Notes: Reported by the user on 2026-11-16 in dev (`localhost:4200`, Chrome with KeePassXC's
  passkeys allowed on localhost). Add-passkey code: `packages/web/feature-auth/src/lib/passkeys/`,
  `Passkeys` and `WebAuthnClient` in `data-access-auth`. The notice comes from
  `packages/web/data-access-sync/src/lib/rejection-notices.ts`. Find the root cause of each
  first; don't paper over it with a timeout.

### T-030 — Sync status and update handling

- Completed: 2026-11-16 — Space page Sync section (state, unsynced count, last sync, "Sync now", error list); `SyncEngine.syncNow()`, `errorLog`; "update required" starts `AppUpdates.updateRequired()` (`data-access-sync`, `feature-space`, `util-pwa`).
- Review: Changes requested; 9 fixed (4 substantive, 5 trivial), 1 skipped (T-041), 0 disagreed; re-review rounds: 1
- Milestone: M6 Collaboration polish
- Area: web
- Priority: normal
- Depends on: T-009, T-003
- Done when:
  - Offline state, the number of unsynced changes, the last sync time and a "Sync now" action are
    visible.
  - Sync errors can be inspected.
  - An "update required" answer from the server starts the service worker update flow instead of
    failing silently.

### T-029 — Rejection notices, deleted-while-editing, undo

- Completed: 2026-11-15 — the item edit dialog says "Deleted by <name>" / "Removed by …" (or that its list was deleted) with Restore, for list items and run items, keeping what was typed; rejection wording checked, schema path dropped from validation reasons; Undo already covered lists, items and includes (`item-dialog`, `list-editor-page`, `run-page`, `Repositories`).
- Review: Changes requested; 8 fixed (4 substantive, 4 trivial), 0 skipped, 0 disagreed; re-review rounds: 1
- Milestone: M6 Collaboration polish
- Area: web
- Priority: normal
- Depends on: T-026
- Done when:
  - Every rejected change shows a snackbar with a readable reason. (Done early in T-016:
    `RejectionNotices` in `data-access-sync`; check its wording here.)
  - Editing an item that someone else just deleted shows "Deleted by Ben", with Restore.
  - Undo is offered after deleting lists and items and after removing includes.

### T-028 — "Checked by" attribution

- Completed: 2026-11-15 — run items show who checked or skipped them and when; the item dialog shows who changed the item last (`CurrentSpace.memberName`, `attribution()` in web/ui, run page, list editor)
- Review: Changes requested; 5 fixed (2 substantive, 3 trivial), 0 skipped, 0 disagreed; re-review rounds: 1
- Milestone: M6 Collaboration polish
- Area: web, api
- Priority: normal
- Depends on: T-026, T-020
- Done when:
  - Run items show who checked or skipped them and when ("Anna · 14:02").
  - Item details show who edited them last.

### T-027 — Passkeys

- Completed: 2026-11-15 — passkeys (WebAuthn, SimpleWebAuthn 14): `passkeys` table, `/api/passkeys` and passkey sign-in in `api-feature-auth`, `Passkeys`/`WebAuthnClient` in `web-data-access-auth`, profile section and "Sign in with a passkey" in `web-feature-auth`; a hung passkey prompt can be cancelled and never locks the sign-in page or the profile form
- Review: Changes requested (0 blocker, 1 major, 3 minor, 1 nit); 5 fixed, 0 deferred, 0 declined; plus the user-reported "buttons stay disabled after a failed passkey sign-in" fixed
- Milestone: M5 Accounts and spaces
- Area: api, web
- Priority: normal
- Depends on: T-026
- Done when:
  - Passkeys (WebAuthn) via `@simplewebauthn/server` and `@simplewebauthn/browser` 14, stored in a
    `passkeys` table (credential id, public key, sign counter, transports, name, created and last
    used).
  - On their profile, users add a passkey, name it, and remove it; they only ever see their own.
  - The sign-in page offers "Sign in with a passkey", using discoverable credentials, so no
    username is needed.
  - The relying-party id and origin come from `PUBLIC_URL`; `localhost` works in development.
  - E2E with a virtual authenticator (Chromium): add a passkey, sign out, sign in with it, remove
    it.

### T-026 — Web: sign-in, profile, user administration and spaces

- Completed: 2026-11-13 — web sign-in, setup, forced password change and profile (`feature-auth`), user administration (`feature-admin`), space switcher and management (`feature-space`), `AuthSession` and guards (`data-access-auth`); signed-out state in the sync status, sign-out wipes the device; `PATCH /api/auth/me`
- Review: Changes requested (0 blocker, 2 major, 6 minor, 1 nit); 10 fixed, 0 deferred, 0 declined
- Milestone: M5 Accounts and spaces
- Area: web
- Priority: normal
- Depends on: T-025
- Done when:
  - A `packages/web/feature-auth` library with sign-in, first-run setup, the forced password
    change, and a profile page (display name, password).
  - A `packages/web/feature-admin` library, shown to admins only: the user list; creating, editing
    and deleting users; resetting passwords; granting and revoking admin.
  - A `packages/web/feature-space` library: a space switcher; creating and renaming spaces; adding
    and removing members; leaving a space.
  - If the session expired while offline, the app keeps working, keeps pending changes, and asks
    for sign-in once online.
  - Signing out warns about unsynced changes and clears the local data.

### T-025 — Authenticated and authorized sync

- Completed: 2026-11-13 — authenticated, membership-scoped sync: session-cookie socket handshake, welcome with spaces and members, rooms follow membership changes, real user stamping, web drops removed spaces, dev user/space removed, e2e signs in through the API (feature-sync, feature-spaces, feature-auth, data-access-sync, lister-web-e2e)
- Review: Changes requested (1 blocker, 1 major, 2 minor, 2 nit); 6 fixed, 0 deferred, 0 declined
- Milestone: M5 Accounts and spaces
- Area: api, web
- Priority: normal
- Depends on: T-024, T-009
- Done when:
  - The socket handshake authenticates with the session cookie; connections without a valid
    session are refused.
  - Welcome lists the user's spaces with their members' display names; pull, push and poke work
    only for spaces the user belongs to.
  - Mutations are stamped with the real user; a member who is removed is disconnected from that
    space at once.
  - The web sync engine syncs all of the user's spaces.
  - Integration tests: a non-member can neither read nor change a space, over HTTP or the socket.
  - The dev user and space from T-006 are removed (moved here from T-024); the web e2e suite signs
    in through the API until T-026 adds the sign-in screen.
- Notes: Remove `DevSeed`, `DEV_USER_ID`, `DEV_SPACE_ID` and `SyncReader.devSpaces()`
  (packages/api/feature-sync).

### T-024 — Spaces and memberships

- Completed: 2026-11-13 — spaces and memberships over REST (`packages/api/feature-spaces`), personal spaces created and deleted with accounts, migration 0006
- Review: Changes requested (0 blocker, 1 major, 1 minor, 3 nit); 5 fixed, 0 deferred, 0 declined
- Milestone: M5 Accounts and spaces
- Area: api
- Priority: normal
- Depends on: T-023, T-006
- Done when:
  - Spaces and memberships (D14): every user has a personal space; any user can create a shared
    space and add existing users; the creator owns it and manages its members.
  - Endpoints to create, rename and delete spaces, add and remove members, and leave a space.
  - Deleting a user also deletes their personal space; shared spaces keep their content.
  - Tests for the membership and ownership rules.
- Notes: Keep `DevSeed` and the dev space: until T-025 the sync socket has no session check and
  only ever reaches the dev space (`SyncReader.devSpaces()`, commit 30cc0d5), never the spaces
  this task creates. Removing it here would leave the web app with nothing to sync (decided
  2026-11-13: removal moves to T-025).

### T-023 — User administration

- Completed: 2026-11-13 — admin-only `/api/users` endpoints (list, create, edit, delete, reset password, grant/revoke admin) in `packages/api/feature-auth`; last-admin check and write share one synchronous SQLite transaction; sessions end on delete and reset
- Review: Changes requested; 3 fixed (1 substantive, 2 trivial), 0 skipped, 0 disagreed; re-review rounds: 1
- Milestone: M5 Accounts and spaces
- Area: api
- Priority: normal
- Depends on: T-022
- Done when:
  - Admin-only endpoints to list, create (username, display name, temporary password), edit and
    delete users, reset a password (to a temporary one), and grant or revoke admin.
  - The last admin can't be deleted or demoted.
  - Non-admins get 403 from all of them.
  - Deleting a user or resetting their password ends their sessions.
  - Tests for each endpoint and for the last-admin rule.

### T-039 — Tooltip for truncated list titles

- Completed: 2026-11-13 — `listerTruncatedTooltip` in `packages/web/ui`: a Material tooltip for titles cut off with an ellipsis, on hover, keyboard focus and long-press; used on the Lists page and the other truncated titles
- Review: Changes requested; 6 fixed (4 substantive, 2 trivial), 0 skipped, 0 disagreed; re-review rounds: 1
- Milestone: — (UI polish before M5 continues)
- Area: web
- Priority: high
- Depends on: —
- Done when:
  - A list title that is cut off with an ellipsis shows its full text in a Material tooltip
    (`MatTooltip`) on hover and keyboard focus, and on long-press on touch. Today that's the
    title link on the Lists page (`packages/web/feature-lists/src/lib/lists-page.*`). Check the
    other screens that show a list title (the list editor's top bar, the list picker, run and
    space pages) for titles that are truncated too, and cover those the same way.
  - A title that fits shows no tooltip. Whether it's truncated is measured from the rendered
    element (`scrollWidth > clientWidth`), and the measurement is updated when the width or the
    title changes (resize, rail ↔ bar layout, edits arriving through sync).
  - It's one reusable directive (for example `listerTruncatedTooltip`) in `packages/web/ui`,
    used wherever titles are truncated, not copied per component.
  - Screen readers still get the full title once, from the text itself: no duplicate
    `aria-describedby` for a title that's already fully in the DOM.
  - Tests: a unit test of the directive (truncated → tooltip, fits → none, update when the text
    changes), and a Playwright check at 375 px that hovering or focusing a long title shows the
    full text, with the axe check still clean.

### T-022 — Accounts, sessions and the admin role

- Completed: 2026-11-13 — new `packages/api/feature-auth`: users and sessions (argon2id, hashed session tokens), login/logout/me/password/setup routes with a 90-day renewing cookie, a global auth guard (forced password change, `@AdminOnly`), setup token, `reset-password` command, per-IP rate limit
- Review: Changes requested; 8 fixed (4 substantive, 4 trivial), 0 skipped, 0 disagreed; re-review rounds: 2
- Milestone: M5 Accounts and spaces
- Area: api
- Priority: normal
- Depends on: T-004
- Done when:
  - `users` (username, display name, password hash, admin flag, must-change-password flag) and
    `sessions` tables, in `packages/api/feature-auth` (scope:api, type:feature). Passwords are
    hashed with Node's built-in `crypto.argon2`.
  - `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` and
    `POST /api/auth/password` (change your own password), using an httpOnly session cookie
    (SameSite=Lax, `Secure` when `PUBLIC_URL` is https) that lasts 90 days and renews on use (D15).
  - A user flagged "must change password" can do nothing else until they've changed it.
  - First start: while no account exists, the server logs a one-time setup token, and
    `POST /api/auth/setup` with it creates the first account, as an admin.
  - A server command resets a user's password, for when no admin can sign in.
  - Sign-in attempts are rate-limited per client IP (behind Traefik, taken from
    `X-Forwarded-For`).
  - Tests cover sign-in, sign-out, expiry, the forced password change, the setup token, the reset
    command and the rate limit.
- Notes: T-006 seeded no user row: `DEV_USER_ID` (feature-sync) only stands in as `createdBy`/`updatedBy`; decide what happens to rows stamped with it.
- Decision: rows stamped with `DEV_USER_ID` stay as they are. `created_by`/`updated_by` have no foreign key and nothing reads them; T-024/T-025 stop stamping it, and the dev data is throwaway.

### T-038 — Templates and styles in their own files

- Completed: 2026-11-13 — inline templates and styles of 11 components moved to `.html`/`.scss` files; skills and `nx.json` generator defaults updated; Prettier Angular parser for templates
- Review: Changes requested; 2 fixed (1 substantive, 1 trivial), 0 skipped, 0 disagreed; re-review rounds: 1
- Milestone: — (refactor before M5)
- Area: web
- Priority: high
- Depends on: —
- Done when:
  - No Angular component in `apps/lister-web` or `packages/web/*` uses inline `template` or
    `styles`: each has its own `<name>.html` (and `<name>.scss` when it has styles) next to its
    `.ts`, referenced with `templateUrl` / `styleUrl`. Today that's `sync-indicator`,
    `trash-page`, `space-page`, `list-picker-dialog`, `navigation-rail`, `navigation-bar`,
    `sync-badge`, `loading-hint`, `title-dialog`, `item-dialog` and `theme-picker`; check with a
    grep for any others, including test-only host components outside `*.spec.ts`.
  - The skills say so: `angular-feature` drops "Add `--inlineTemplate --inlineStyle` for small
    components" and `best-practices` drops "Small components get an inline template and inline
    styles"; both state that templates and style sheets always live in their own files.
    `nx.json > generators > @nx/angular:component` doesn't inline (set `inlineTemplate: false`,
    `inlineStyle: false` explicitly if the generator supports them).
  - Pure move: rendered output and behaviour are unchanged; every existing unit and e2e test
    passes without edits beyond file paths, and no component exceeds its style budget.
- Notes: components with no styles get no empty `.scss`.

### T-021 — Save a run as a list

- Completed: 2026-11-12 — "Save as list" in the run menu via the new atomic `run.saveAsList` mutation (sync-protocol, sync engine, feature-runs run page), design §2.2
- Review: Changes requested; 3 fixed (2 substantive, 1 trivial), 0 skipped, 0 disagreed; re-review rounds: 1
- Milestone: M4 Runs
- Area: web
- Priority: normal
- Depends on: T-020
- Done when:
  - "Save as list" in a run's menu creates a new reusable list with copies of the run's items, in
    order. The run itself is unchanged.
  - The app never suggests it (not when a run finishes, not for ad-hoc runs) and never requires it
    (D13).

### T-020 — Runs UI

- Completed: 2026-11-12 — Runs UI in `packages/web/feature-runs` (Runs page, run page, RunStarter), Start run in feature-lists, run repositories, two-person e2e.
- Review: Changes requested; 7 fixed (2 substantive, 5 trivial), 0 skipped, 0 disagreed; re-review rounds: 1

- Milestone: M4 Runs
- Area: web
- Priority: normal
- Depends on: T-019, T-016
- Done when:
  - A `packages/web/feature-runs` library (scope:web, type:feature). "Start run" on a list creates a
    run (title prefilled with the list name and date) and opens it.
  - "New run" on the Runs page creates an empty ad-hoc run; items are typed or pasted straight in.
  - The Runs destination shows the active runs with their progress. Finished runs appear nowhere:
    not there, and not where runs are started (D10).
  - A run shows its items grouped by the list they came from (merged items also say which other
    lists they come from), with check, uncheck and skip, and a progress bar.
  - Checked items stay in place, struck through. A toggle, remembered on the device, moves them into
    a "Done" section while it's on (D12).
  - Items can be added, edited and removed, and a whole list can be added — all only in this run.
  - When everything is checked or skipped, the run disappears and the snackbar offers Undo, which
    reverts the last check.
  - E2E: two people checking items in the same run see each other's checks live, and both see the
    run disappear when it's finished.

### T-019 — Run model, including ad-hoc runs

- Completed: 2026-11-12 — `Run`/`RunItem` with run.start (from a list or ad-hoc), run.update, run.addItems, runItem.update/move/remove/restore/setState (migrations 0003–0004, Dexie v5–v6); shared D16 merge rules and finishing in the same change; the engine rebuilds every item of each run concerned.
- Review: Changes requested (2 major, 5 minor, 1 nit); all fixed: merged-away ids stay as aliases (`mergedInto`), so offline checks on them apply (design §2.4, §3); run rules tested for other spaces; a merge that unchecks records who and when; no-op merges write nothing; restore merges into an identical item; run.start checks its source list; an engine test with an untouched unchecked item; `mergeNote` both ways, ignoring case.

- Milestone: M4 Runs
- Area: shared, api, web
- Priority: normal
- Depends on: T-015
- Done when:
  - Runs and run items exist in the domain, in SQLite (migration) and in Dexie (version bump), with
    mutations:
    - start: from a list — the client copies the list's flattened items into the run, so starting
      works offline — or empty, for an ad-hoc run;
    - rename; add, edit, move and remove run items; add a whole list, whose flattened items are
      copied in as a new section;
    - set an item's state: unchecked, checked or skipped (always a set, never a toggle).
  - Identical items are merged whenever items enter a run (start, adding a list, adding an item by
    hand), with one shared rule (D16): titles match ignoring case and surrounding spaces; the
    larger quantity wins (empty = 1) and different text quantities are joined; notes are joined;
    the item lists every source list; a checked item whose quantity rises is unchecked again.
  - A run counts as finished while every item is checked or skipped and it has at least one item.
    The server recomputes this in the same transaction as each run-item change, and the client
    applies the same shared rule; unchecking or adding an item reopens the run.
  - Editing a list doesn't change active runs.
  - Unit and integration tests for each rule, including the merge cases and two people finishing and
    reopening a run at the same time.
- Notes: Finished runs are purged by T-033.

### T-018 — Duplicate a list

- Completed: 2026-11-12 — "Duplicate" on the Lists page: one `list.duplicate` mutation (client ids for the list, its item copies and include copies) creates "Copy of <title>" with the items in order and the same includes, atomically and offline; the notice's "Open" goes to the copy.
- Review: Changes requested (1 major, 2 minor, 2 nit); all fixed: one atomic `list.duplicate` instead of N+1 mutations (no build-up, no half-copies; tested in the rules, the engine, over the socket); a message when the data isn't ready; "Open" in the notice; doc comment placement; `copyTitle` cuts on grapheme boundaries.

- Milestone: M3 Composition
- Area: web
- Priority: normal
- Depends on: T-016
- Done when:
  - "Duplicate" on a list creates "Copy of <title>" with copies of its items (same order, new ids)
    and the same includes (still references).
  - It works offline (the ids come from the client).

### T-017 — Trash and restore

- Completed: 2026-11-12 — Trash page (Space › Trash) with lists and items deleted in the last 30 days, who deleted them and when; Restore syncs (`list.restore`/`item.restore`) and a restored list brings its items back; `SpaceChanges` moved to `data-access-sync`; `LoadingHint` (delayed "Loading…") for every page.
- Review: Changes requested (4 major, 3 minor, 4 nit; first review with `ui-review`); all fixed: visible "Trash" heading on phones; focus moves to the next Restore; no "Loading…" flash; socket integration tests for list/item restore and a second device in the e2e; items deleted inside a deleted list are mentioned; "not connected yet" state; calendar-day "yesterday"; date comment; single-pass counts; days from `TRASH_KEEP_DAYS`; library descriptions. Non-member restores are tested with memberships (T-025).

- Milestone: M3 Composition
- Area: web, api
- Priority: normal
- Depends on: T-011
- Done when:
  - A Trash page (reached from Space) lists lists and items deleted in the last 30 days (D15), with
    who deleted them and when.
  - Restore brings back a list or an item and syncs like any other change.
  - Deleting a list doesn't delete its items, so restoring the list brings them back too.

### T-016 — Composition UI

- Completed: 2026-11-12 — list editor with included lists as foldable sections among the items (move, remove with Undo, trash placeholder, "shown above" repeats), "Add list" picker (`ListPickerDialog`) without the list itself, lists it already contains and loops; editing inside a section edits the source list and says who else uses it; `Repositories.compositionOfSpace()`; `RejectionNotices` for refused changes (from T-029); keyboard-move focus fix.
- Review: Changes requested (1 blocker, 3 minor, 1 nit); all fixed, re-review approved: top-level repeats labelled correctly and kept out of the picker; search icon prefix; refocus can't linger; "other lists" excludes lists reaching it through this one; nested entries tracked by id; duplicated comment.

- Milestone: M3 Composition
- Area: web
- Priority: normal
- Depends on: T-015, T-011
- Done when:
  - In the list editor, "Add list" opens a searchable picker that leaves out the list itself, lists
    already included and lists that would create a loop.
  - Included lists appear as collapsible sections named after the list, with their items and
    nested includes. Sections can be reordered among the items and removed.
  - Editing an item inside a section edits its source list, and the UI says how many other lists
    use that list.
  - An included list that is in the trash shows as a "deleted list" placeholder.
  - A rejected include (someone else created the other half of a loop) shows a snackbar with the
    reason.

### T-015 — Composition model: includes, flattening, cycle rejection

- Completed: 2026-11-12 — `Include` with `include.create/move/delete/restore` (migration 0002, Dexie v4 with a forced snapshot); shared rules reject self-includes, duplicates and loops (also on restore); `flatten()` / `flattenEntries()` (sections: live, deleted, repeated) and `wouldCreateCycle()` in `domain`; the engine predicts and rebuilds with every include of the space; two-client loop tested over the socket.
- Review: Approve with minor fixes (4 minor, 1 nit); minors fixed: socket test for move/delete/restore and a retried create; the duplicate and trash rules are in design §2.2; `flattenEntries()` gives the editor its sections; table-driven edge cases. Declined the nit (per-list scan in `MemoryRowStore.includesOf`): fine at tens of includes. Non-member pokes are tested once memberships exist (T-025).

- Milestone: M3 Composition
- Area: shared, api, web
- Priority: normal
- Depends on: T-013
- Done when:
  - Includes exist in the domain, in SQLite (migration) and in Dexie (version bump), with mutations
    to add, move and remove one.
  - Shared `flatten(listId)` returns a list's items in position order across its own items and its
    included lists. It recurses into nested lists and visits each list once, so diamonds appear
    once and cycles can't loop.
  - Shared `wouldCreateCycle(parent, child)`. The server rejects an include that would create a
    cycle, including when two offline clients each add one half of a loop (the second is rejected).
  - Unit tests for flattening (nesting, order, diamonds) and cycles; an integration test for the
    two-client loop.

### T-014 — Write down the synced-feature recipe

- Completed: 2026-11-12 — `fullstack-feature` Path A is the real recipe (files, APIs, commands, e2e helpers, a checklist of every place a new table goes); `nest-feature`, `angular-feature`, `testing`, CLAUDE.md and design §4.2/§5 describe `MutationService` + shared `applyMutation()` rules instead of per-mutation handlers.
- Review: Changes requested (2 major, 2 minor, 1 nit); all fixed: the engine steps add `mutate()`'s store, rows reached through references and `touchedBy`'s argument names; a new synced table or field clears `syncState` in its Dexie version so old clients get a snapshot (design §2.5); relation queries on `RowStore`; "mutation handlers" wording removed everywhere; `SyncMetadata`, missing e2e helpers.

- Milestone: M2 Sync walking skeleton
- Area: infra
- Priority: normal
- Depends on: T-013
- Done when:
  - The `fullstack-feature` skill's synced-data path names the real files, APIs and commands
    (mutation schema, migration command, handler registration, Dexie version bump, local apply,
    repository, e2e helpers) instead of the outline it has now.
  - `angular-feature`, `nest-feature` and `CLAUDE.md` match the code.
  - The recipe matches how lists and items were actually built in T-006 – T-013.

### T-035 — Type-check every project in CI

- Completed: 2026-11-12 — `tools/typecheck-plugin.mjs` infers a cached `typecheck` target (`tsc --noEmit` per app/lib and spec tsconfig) for every project; spec and e2e tsconfigs use ESM so the Vitest/Playwright configs type-check; CI, `verify`, docs run `affected -t lint typecheck test build`.
- Review: Approve with minor fixes (1 minor, 1 nit); both fixed: `drizzle.config.ts` is type-checked through the data-access-db spec tsconfig; the plugin's comment says its `@ts-check` is editor-only.

- Milestone: M2 Sync walking skeleton
- Area: infra
- Priority: normal
- Done when:
  - Every project has a `typecheck` target (`tsc --noEmit`) for its library or app tsconfig
    **and** its spec tsconfig, and `nx affected -t typecheck` runs in CI and in the `verify`
    skill.
  - The generated `vitest.config.mts` / `vite.config.mts` files type-check too (today they fail
    under the spec tsconfigs with TS1343), or are excluded on purpose.
- Notes: Found in T-006. App builds type-check only through the app's tsconfig, and Vitest
  doesn't type-check, so a library's stricter options (e.g. `noPropertyAccessFromIndexSignature`)
  and stale types in specs went unnoticed. One spec still built a `HealthResponse` without `db`
  after T-004 changed the contract.

### T-013 — E2E: real-time and offline sync

- Completed: 2026-11-12 — two-device specs `sync.spec.ts` (live add/paste/edit/reorder/delete, offline changes converge) and `sync.pwa.spec.ts` (offline reload keeps data and the pending change); the sync engine rebuilds only changed rows (full rebuild only for snapshots), "online" reconnects at once, each e2e server starts from an empty database.
- Review: Approve with minor fixes (4 minor, 1 nit); all fixed: the partial rebuild ignores rows of other spaces, writes in bulk; the "online" test models Socket.IO's backoff; the offline spec checks B's move survives; separate resets for the two e2e databases. The test-teardown `DatabaseClosedError` noise is deferred (T-037).

- Milestone: M2 Sync walking skeleton
- Area: web, api
- Priority: high
- Depends on: T-011, T-012
- Done when:
  - Specs with two browser contexts: an item added, edited, reordered or deleted in A shows up in B
    without a reload.
  - Offline: A goes offline (`context.setOffline(true)`) and makes changes while B changes other
    items; once A is back online, both show the same content.
  - Reloading while offline (production build) still shows the data and the pending changes, which
    sync once online.
  - The specs run in CI.

### T-012 — Serve the web app from the API (one origin)

- Completed: 2026-11-12 — `serveWebApp()` in the API (SPA fallback, cache headers, `/api` and `/socket.io` never get the page), `npm run start:prod` (port 3100), `LISTER_DEV_SEED`, Playwright `pwa` project on the production setup; integration and e2e tests.
- Review: Changes requested (2 major, 3 minor, 2 nit); all fixed: only extension-less paths are pages, so missing files 404 under browser `Accept` headers; Nx owns the production e2e server (`lister-api:serve-prod-e2e`, ready signal, fresh database each run) and Playwright no longer starts or reuses it; hashes with `-` are immutable; a wrong explicit `WEB_ROOT` stops startup; both e2e servers use one production build; the same-origin e2e checks the WebSocket; reserved paths from `API_PREFIX`, case-insensitive; `serve-static` removed. Security headers noted for T-032.
- Milestone: M2 Sync walking skeleton
- Area: api, web
- Priority: high
- Depends on: T-003, T-007
- Done when:
  - The production API serves the built web app (`dist/apps/lister-web/browser`) with SPA
    fallback; `/api/**` and `/socket.io/**` are never answered with `index.html`.
  - One documented command builds both and starts the production setup locally.
  - Playwright can run against this setup, with the service worker active.
- Notes: This is the deployment topology (design §2.9), and the offline e2e tests need it.

### T-011 — Web: list editor

- Completed: 2026-11-12 — `ListEditorPage` at `/lists/:listId` (items in order, inline add, multi-line paste, `ItemDialog` for title/quantity/note, delete with Undo, drag and drop plus Move up/down), `SpaceChanges`, `moveTo` in the domain; unit and e2e tests.
- Review: Changes requested (4 major, 3 minor, 2 nit); all fixed: drops move the dragged item (`cdkDragData`), `moveTo` re-keys tied rows so a move always takes effect, adds run one at a time from the last key handed out, keyboard moves keep the focus and announce the new position, pastes are validated before anything is added, long titles wrap and notes keep line breaks, the e2e checks the count and renames, the tab title names the list, `SpaceChanges` is typed without a cast.
- Milestone: M2 Sync walking skeleton
- Area: web
- Priority: high
- Depends on: T-010
- Done when:
  - Opening a list shows its items in order; an inline field adds an item.
  - Pasting several lines into that field creates one item per line.
  - An item's title, quantity and note can be edited; deleting an item offers Undo.
  - Items can be reordered by drag and drop, and with "Move up" / "Move down" in the item menu.
  - Component tests cover adding, pasting, editing, deleting with undo, and reordering.

### T-010 — Web: Lists page

- Completed: 2026-11-12 — `packages/web/feature-lists` (Lists page: counts, empty/loading/error/not-connected states, New list FAB, rename, delete with Undo, all via the sync engine); `TitleDialog` and `SyncBadge` in `ui`; deferred `SyncIndicator` in the shell; `Notifier` snackbar queue (`util-notify`); `CurrentSpace` and item counts; engine follows browser offline/online. E2E: create/rename/delete/undo, two contexts, offline with the badge.
- Review: Changes requested (1 blocker, 2 major, 5 minor, 3 nit); fixed (offline e2e and indicator wiring, Notifier sticky replacement, accessible compact badge, FAB states, quick Undo, destination title, design §2.7/§5, `submit()`, count errors, empty state). Re-review: Approve with minor fixes (2 minor, 1 nit), all fixed: going offline closes only the transport (Socket.IO keeps reconnecting), no reconnect after `updateRequired`, every queued notice is cut short, FAB with built-in control flow. Declined with reasons in design §2.7: FAB in the rail, flat rows; `SyncIndicator` stays in the app.
- Milestone: M2 Sync walking skeleton
- Area: web
- Priority: high
- Depends on: T-002, T-009
- Done when:
  - A `packages/web/feature-lists` library (scope:web, type:feature) provides the Lists
    destination: all lists of the space with their item counts, and an empty state.
  - A FAB creates a list (title dialog). Lists can be renamed and deleted; deleting offers Undo in
    a snackbar.
  - Every change goes through the sync engine, works offline, and appears on another open device
    without a reload.
  - The app bar shows a small sync indicator: offline, or "N changes not synced".
- Notes: MatSnackBar shows one snackbar at a time, so a new one replaces the update prompt
  (`AppUpdates` in `@lister/web/util-pwa` re-offers it later) or another Undo. Snackbars that
  must not be lost (Undo, rejections) go through one small queue; decide it here (T-003 review).

### T-009 — Web: sync engine with offline outbox

- Completed: 2026-11-12 — `packages/web/data-access-sync` (`SyncEngine`: optimistic `mutate`, outbox, leader-tab socket, pokes, gap pulls, acks, rollback, rebase, backoff, status signals; `provideSync` loads it lazily); shared `applyMutation` in `@lister/shared/sync-protocol`, now also used by the server.
- Review: Changes requested (1 major, 8 minor, 1 nit); all fixed: status, last sync and rejections live in the local database so every tab sees them (Dexie version 2 adds `rejections`), server messages validated with the tolerant schemas, guarded emits (nothing buffered before hello), backoff reset only after a mutation is answered, one pull per gap, rebuild reads its context once, a snapshot behind an ack resends the change, tests for acks before their rows and the cross-tab outbox, CLAUDE.md.
- Milestone: M2 Sync walking skeleton
- Area: web
- Priority: high
- Depends on: T-007, T-008
- Done when:
  - `packages/web/data-access-sync` (scope:web, type:data-access) offers `mutate(...)`: the change
    is applied to the local database at once, using the shared rules, and queued in the outbox.
  - The engine connects with `socket.io-client`, says hello, pulls, then pushes the outbox in
    order. A mutation leaves the outbox once its version has arrived; a rejected one is rolled back
    and reported.
  - Pokes are applied; a version gap triggers a pull; pending mutations are re-applied on top of
    incoming server rows.
  - Signals: `online`, `syncing`, `pendingCount`, `lastSyncedAt`, `errors`.
  - Only one tab syncs at a time (Web Locks); other tabs see changes through the local database.
  - Unit tests with a fake socket cover offline queueing, flushing on reconnect, rejection
    rollback, gap pull and rebase.
- Notes: Uses the dev user and space until T-025.

### T-008 — Web: local database with Dexie

- Completed: 2026-11-12 — `packages/web/data-access-local-db`: `LocalDb` (Dexie 4, schema version 1), `liveQuerySignal` (loading/ready/error state) and `Repositories` (lists by title, items by position), tested with fake-indexeddb.
- Review: Approve with minor fixes (4 minor, 2 nit); all fixed: failed queries show as `error`, no sleep in tests, direct helper tests (error, stale results), schema ready for T-009 (server copies `serverLists`/`serverItems` for rebase and rollback, recorded in design §4.2; outbox indexed by mutation id and space with `ackedVersion`; space members), list order documented in design §3, redundant code removed.
- Milestone: M2 Sync walking skeleton
- Area: web
- Priority: high
- Depends on: T-005
- Done when:
  - `packages/web/data-access-local-db` (scope:web, type:data-access) defines a versioned Dexie
    database with tables for spaces, lists, items, the outbox and sync metadata.
  - A helper turns Dexie `liveQuery` results into Angular signals.
  - Repository queries: the lists of a space (by title) and the items of a list (by position),
    without tombstoned rows.
  - Tests with `fake-indexeddb` show the signals update when rows change.

### T-007 — Server: Socket.IO sync gateway

- Completed: 2026-11-12 — `SyncGateway`, `SyncReader` and `SyncIoAdapter` in `packages/api/feature-sync` (hello/welcome/updateRequired, pull, push with ack/reject and pokes, WebSocket only, Origin from `PUBLIC_URL`); dev proxy for `/socket.io`; integration tests with socket.io-client; e2e through the proxy.
- Review: Changes requested (1 major, 2 minor, 2 nit); all fixed: tests for every failure path (storage failure keeps the mutation without a reject, invalid/out-of-order messages, foreign space, failing pull), a `since` ahead of the server gets a snapshot, pull failures disconnect like push failures, failure behaviour documented in design §4.2 and the protocol, no served client bundle, `PUBLIC_URL` must be http(s).
- Milestone: M2 Sync walking skeleton
- Area: api
- Priority: high
- Depends on: T-006
- Done when:
  - A Socket.IO gateway (WebSocket transport only) implements hello/welcome, pull, push and poke as
    in design §4.2; an unsupported protocol version gets an "update required" answer.
  - Pull returns every row of the space changed after the given version, tombstones included;
    `since: 0` returns a full snapshot.
  - Push handles mutations in order and answers each with an ack (new version) or a rejection
    (reason); changed rows are poked to the space's room.
  - The handshake checks the `Origin` header against `PUBLIC_URL` (in development, the dev
    server's origin).
  - The web dev proxy forwards `/socket.io` with WebSockets enabled.
  - Integration tests (`socket.io-client` against `createTestApp()`): A pushes and B gets the
    poke; B reconnects after missing changes and catches up by pulling; a resent mutation isn't
    applied twice; a foreign origin is refused.
- Blocked: 2026-11-12 06:00 scheduled resume — implementation committed (5b40d9f), but the
  review session could not be started (`mcp__ccd_session__start_session` is not available in
  the scheduled run). Review range `22271c8..5b40d9f`. Needs the user to start the review (or
  approve another way to run it) before T-035 / T-008 begin.

### T-006 — Server: lists and items as mutations

- Completed: 2026-11-12 — migration 0001 (spaces, lists, items, processed_mutations); `packages/api/feature-sync` with `MutationService` (one synchronous transaction per mutation, versioned rows, recorded answers) and handlers for list/item create, update, delete, restore and item move; `DevSeed` (dev space; the dev user is only an id, no row). No `list.move`: lists sort by title (design §3).
- Review: Approve with minor fixes (6 minor, 2 nit); all fixed: replays only within the same space, invalid entries not recorded, creates idempotent by id, one rule for items of a deleted list (ignored, design §2.4), typed dispatch, more tests (missing rows, rollback, returned rows, dev seed via the app), README, notes in T-022/T-024.
- Milestone: M2 Sync walking skeleton
- Area: api
- Priority: high
- Depends on: T-004, T-005
- Done when:
  - Drizzle tables and a migration for `spaces` (with a version counter), `lists`, `items` and
    `processed_mutations`.
  - In development, startup makes sure a dev user and a dev space exist (removed by T-024).
  - Mutation handlers for list and item create, update, move, delete and restore live in
    `packages/api/feature-sync` (scope:api, type:feature). Each mutation runs in one synchronous
    transaction with per-field patches; the space version goes up by one per mutation and is
    stored on every changed row.
  - An update to a deleted row is ignored (delete wins); a repeated mutation id is applied once and
    gets the same answer; invalid arguments are rejected with a reason.
  - Integration tests on in-memory SQLite cover each rule.

### T-005 — Shared `domain` and `sync-protocol` libraries

- Completed: 2026-11-12 — `packages/shared/domain` (entities, UUIDv7 ids, fractional positions with id tie-break, D6 quantity, limits) and `packages/shared/sync-protocol` (`PROTOCOL_VERSION`, mutation, message and row schemas, `parseMutation`, typed Socket.IO events), with unit tests.
- Review: Changes requested (3 major, 5 minor, 2 nit); all fixed: server → client schemas tolerate unknown fields (additive changes keep old clients working), `push` is validated per mutation so one bad entry is rejected by id, malformed position keys are refused (`isPositionKey`), `positionBetween` refuses ties, `undefined`-only patches, lower-case ids, control characters and invisible titles refused, row limits from `LIMITS`, new `sharedPlatformRules` lint (no Node built-ins or browser globals in shared code). List icon/colour deferred (design §8).
- Milestone: M1 Foundations
- Area: shared
- Priority: high
- Done when:
  - `packages/shared/domain` (scope:shared, type:util) exports the entity types for spaces, lists
    and items with the sync metadata from design §3, a UUIDv7 id helper, and position helpers on
    `fractional-indexing` (between two neighbours, append; equal keys ordered by id).
  - `packages/shared/sync-protocol` (scope:shared, type:util) exports `PROTOCOL_VERSION` and Zod
    schemas with inferred types for the socket messages (hello, welcome, pull, rows, push, ack,
    reject, poke) and for the list and item mutations (create, update, move, delete, restore).
  - Item quantity is optional free text; empty means 1 (D6).
  - Unit tests: schemas accept valid and reject invalid examples; positions sort correctly,
    including two clients inserting at the same spot.
- Notes: No Angular, Nest, Node or browser-only imports. Includes and runs are added by T-015 and
  T-019.

### T-004 — SQLite database layer with Drizzle and migrations

- Completed: 2026-11-12 — `packages/api/data-access-db` (Drizzle on better-sqlite3, pragmas, migrations via `db-generate`, applied on startup with foreign keys checked); health reports the database; `createTestDatabase()` and `createTestApp()` with the first integration tests; e2e servers use their own database (`lister-api:serve-e2e`).
- Review: Changes requested (1 major, 3 minor, 2 nit); all fixed: migrations run with foreign keys off and are checked afterwards (a parent-table rebuild had cascade-deleted children), an empty `DATABASE_PATH` is rejected, e2e no longer touches `data/lister.db`, test helpers documented as test-only, `better-sqlite3` pinned to its approved version, library README.
- Milestone: M1 Foundations
- Area: api
- Priority: high
- Done when:
  - A `packages/api/data-access-db` library (scope:api, type:data-access) provides a Nest module
    with Drizzle on `better-sqlite3`, configured by `DATABASE_PATH` (default `data/lister.db`;
    tests use `:memory:`).
  - On connect: `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`, `synchronous=NORMAL`.
  - Migrations are generated with drizzle-kit through a documented Nx target, committed, and
    applied when the API starts.
  - `GET /api/health` also reports the database (`db: 'ok'`), and the API e2e test checks it.
  - A test helper gives each test a fresh, migrated in-memory database.
  - `createTestApp()` in `apps/lister-api/src/testing/` starts the real `AppModule` with the same
    setup as `main.ts` (a shared `configureApp()`), on a fresh in-memory database and a random
    port, for the integration tests in `apps/lister-api/src/integration/` (`testing` skill). An
    integration test covers `GET /api/health`.
  - `data/` is git-ignored, and `DATABASE_PATH` is in the README's environment table.
- Notes: Make sure the webpack build keeps `better-sqlite3` external and the built `main.js`
  starts.

### T-003 — Installable PWA with offline app shell and update prompt

- Completed: 2026-11-12 — `@angular/service-worker` (prod only) with `ngsw-config.json`; manifest and checklist icons (`npm run icons`); `packages/web/util-pwa` (update prompt, unrecoverable reload, hourly/foreground checks); e2e against the production build (`*.pwa.spec.ts`, port 4300): offline load, update prompt and reload, manifest and icons.
- Review: Approve with minor fixes (4 minor, 3 nit); all fixed: the update prompt is re-offered when another snackbar replaces it (queue for Undo noted in T-010), the production server is a Playwright webServer so atomized targets work, tests for no worker on the dev server and for the real update flow, `/api` and `/socket.io` without a trailing path excluded, manifest `id`, test and tooling tidy-ups.
- Milestone: M1 Foundations
- Area: web
- Priority: high
- Depends on: T-001
- Done when:
  - `@angular/service-worker` is set up for `lister-web` (via the `@angular/pwa` schematic) and
    registers only in production builds.
  - `ngsw-config.json` prefetches the app shell, caches assets including fonts and icons, has no
    data groups, and excludes `/api/**` and `/socket.io/**` from the navigation fallback.
  - Manifest: name and short name "Lister", standalone, `start_url` and `scope` `/`, theme and
    background colours from the theme, and 192 px and 512 px icons including maskable ones: the
    Material Symbols "checklist" glyph on the theme colour (D11).
  - When a new version is ready, a snackbar offers "New version available — Reload".
  - E2E against the production build: after one online visit, the app loads with the browser
    offline.
- Notes: The update logic lives in a `packages/web/util-pwa` library (scope:web, type:util). The
  dev server has no service worker; use the production build (`serve-static`).

### T-002 — App shell with navigation bar and navigation rail

- Completed: 2026-11-12 — App shell in `lister-web` (top app bar + bottom bar below 600 px, rail from 600 px); NavigationBar/NavigationRail in `packages/web/ui`; lazy Lists, Runs and Space in `packages/web/feature-*`; API status and Appearance on Space; unit and e2e tests at 375 and 1280 px with axe.
- Review: Approve with minor fixes (3 minor, 4 nit); fixed: web libraries are `sideEffects: false` (checked by `lint:workspace`) so the theme picker left the initial bundle, scroll resets per destination, safe-area insets with `viewport-fit=cover`, a `<header>` landmark, shared nav item styles, a keyboard step for the bar. Declined: keeping focus across the 600 px layout switch (only while resizing).
- Milestone: M1 Foundations
- Area: web
- Priority: high
- Depends on: T-001
- Done when:
  - A `packages/web/ui` library (scope:web, type:ui) has a navigation bar and a navigation rail
    built with the M3 tokens (`--mat-sys-*`): keyboard accessible, `aria-current` on the active
    destination, unit tested.
  - Below 600 px width the shell shows a top app bar and the bottom navigation bar; from 600 px it
    shows the navigation rail.
  - Destinations Lists, Runs and Space are lazy routes with placeholder pages; `/` opens Lists.
  - The API status from the current home page moves to the Space page, so the existing proxy e2e
    test keeps passing.
  - E2E: switching destinations works at 375 px and at 1280 px width.

### T-001 — Material 3 theme, self-hosted fonts, light and dark

- Completed: 2026-11-12 — Material 3 theme from #00796B in `lister-web` styles; `packages/web/util-theme` (Theme: system/light/dark, remembered, synced across tabs, theme-color metas, pre-boot pin in index.html); `packages/web/ui` ThemePicker; Roboto and Material Symbols self-hosted; unit, index.html and e2e (axe) tests.
- Review: Changes requested (1 major, 3 minor, 1 nit); all fixed: the pin is an inline `color-scheme` style so the production first paint is right, the inline script is tested against util-theme, cross-tab sync, CLAUDE.md, a smaller public API. CSP note added to T-032.
- Milestone: M1 Foundations
- Area: web
- Priority: high
- Done when:
  - Angular Material and CDK 22 are installed, and `lister-web` uses one Material 3 theme
    (`mat.theme`) defined in the global styles, generated from the deep teal seed colour
    `#00796B` (D11).
  - Light and dark follow the system setting; a manual choice (system / light / dark) is
    remembered on the device.
  - Roboto and Material Symbols are bundled from npm packages, and the app makes no requests to
    Google Fonts (checked in an e2e test).
  - `<meta name="theme-color">` matches the theme in light and dark.
- Notes: Generate the palettes with Angular Material's `theme-color` schematic. Material's `ng-add`
  adds Google Fonts links to `index.html`; remove them. Design §2.7.
