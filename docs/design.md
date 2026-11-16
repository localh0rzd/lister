# Lister — Design

> **Status: accepted** (2026-11-12). These decisions hold for v1. If one needs to change, change it
> here first, then update `CLAUDE.md` and `TASKS.md`. The work is tracked in
> [TASKS.md](../TASKS.md) as T-001 – T-033. Decisions that are still open are listed under
> [Open decisions](#open-decisions).

## Decisions

| #   | Topic               | Decision                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Check state         | Reusable **lists** have no check state; a **run** holds it. A run starts from a list or empty (ad-hoc).                                                                                                                                                                                                                               |
| D2  | Composition         | Lists include other lists by **live reference**: editing a list changes every list that includes it. Any depth, no cycles; a list reached twice appears once; no per-composition exceptions in v1. A run **copies** the list's items when it starts, so later edits to the list don't change it.                                      |
| D3  | Users               | Self-hosted. Admins create, edit and delete accounts and can make other users admins; no self-registration. Sign-in with username and password, or with passkeys that each user adds and removes.                                                                                                                                     |
| D4  | Hosting             | A Docker container behind Traefik. Traefik terminates HTTPS; the app speaks plain HTTP and is told its public URL. The Dockerfile lives in the repo.                                                                                                                                                                                  |
| D5  | Conflicts           | Per field, the change that reaches the server last wins; deletes win; invalid changes are rejected with a notice.                                                                                                                                                                                                                     |
| D6  | Item fields (v1)    | Title; quantity, optional free text ("2 pairs", "500 g"), where empty means 1; optional note.                                                                                                                                                                                                                                         |
| D7  | Language            | English only                                                                                                                                                                                                                                                                                                                          |
| D8  | Naming              | Code and UI: List, Item, Include, Run, Space; destinations Lists, Runs, Space. "Run" may be renamed in the UI later; that only touches UI text.                                                                                                                                                                                       |
| D9  | Forgotten passwords | An admin sets a temporary password, which the user must change at the next sign-in. A server command resets a password when no admin can sign in. Either reset also ends the user's sessions and removes all their passkeys, so nothing someone else added survives it; admins never see a user's passkeys.                           |
| D10 | Run lifecycle       | A run is used once. When every item is checked or skipped, it finishes and disappears, with Undo in the snackbar. Finished runs appear nowhere — not among active runs and not where runs are started — and are purged after 30 days (D15). There is no history.                                                                      |
| D11 | Look                | Material 3 theme seeded from deep teal `#00796B`, in light and dark. The theme follows the browser's system setting until the user picks Light or Dark in Space › Appearance (remembered on the device). App icon: the Material Symbols "checklist" glyph on that colour. Mock-ups: https://claude.ai/artifact/RWjDQCAXmBw9FAgBTua6rC |
| D12 | Checked run items   | They stay in place, struck through. A toggle, remembered on the device, moves them into a "Done" section while it's on.                                                                                                                                                                                                               |
| D13 | Save a run as list  | Possible as an action on a run, but never suggested automatically and never required.                                                                                                                                                                                                                                                 |
| D14 | Sharing             | Spaces. Every user has a personal space; anyone can create a shared space and add existing users. The creator owns it and manages its members; all members can edit everything in it; lists only include lists from the same space.                                                                                                   |
| D15 | Time limits         | Sessions last 90 days and renew on use; the trash and finished runs are kept for 30 days; backups run nightly and the last 14 are kept.                                                                                                                                                                                               |
| D16 | Identical run items | Merged into one. Items are identical when their titles match, ignoring case and surrounding spaces. The merged item keeps the larger quantity, not the sum (two lists needing a headlamp still means one headlamp; empty counts as 1); different text quantities are joined, and so are notes. It remembers every list it came from.  |

### Glossary

- **List** — reusable, editable, composable. Has no check state.
- **Item** — an entry of exactly one list: title, optional quantity, optional note.
- **Include** — "list A contains list B", ordered among A's items. A live reference: changes to B
  show up in A (D2).
- **Run** — a one-off checklist, started from a list ("Alps trip, June 2027") or empty
  ("Groceries, Saturday"). Holds its own items with checked/skipped state, and finishes and
  disappears once everything is checked off.
- **Run item** — an item of a run: copied from a list when the run starts (D2), or added to the run
  directly. Identical items are merged into one (D16).
- **Space** — owns lists and runs; its members can edit everything in it (D14).
- **Admin** — a user who can manage all accounts.
- **Mutation** — a change sent by a client ("set the item's title"), applied locally first and by
  the server later.
- **Version** — a per-space change counter. Every row stores the version of its last change.
- **Tombstone** — a soft-deleted row (`deleted_at` set). Deletions sync as tombstones.

## Open decisions

None right now: all open decisions so far (O1–O13) are answered and recorded in the Decisions
table.

New ones get the next number. Each names the first task that needs it and has a default; if it's
still open when that task starts, Claude asks once and proposes the default. Answer in chat or
write the answer into the entry here. Claude then moves it into the Decisions table and adjusts the
affected tasks.

## 1. What Lister is

Reusable checklists — packing lists being the main use case — that can be composed from other
lists, checked off by several people in real time, and used offline as an installable PWA.

| #   | Requirement                                                                                   |
| --- | --------------------------------------------------------------------------------------------- |
| R1  | Works as a PWA                                                                                |
| R2  | Material Design                                                                               |
| R3  | Reusable to-do lists, e.g. packing gear for travel                                            |
| R4  | Lists composed of other lists: "Motorcycle vacation = Basic travel + Hostel + Camping"        |
| R5  | Real-time editing over WebSockets: others see items added, removed and checked immediately    |
| R6  | Works offline; changes sync when back online                                                  |
| R7  | SQLite as the database                                                                        |
| R8  | Ad-hoc runs: items added just to be used and checked once (added 2026-11-11)                  |
| R9  | Runs are used once and are gone when everything is checked off (added 2026-11-12)             |
| R10 | Admin role: admins create, edit and delete users and can make them admins (added 2026-11-12)  |
| R11 | Sign-in with username and password, and passkeys users add and remove themselves (2026-11-12) |
| R12 | Runs as a Docker container behind Traefik, which handles HTTPS (added 2026-11-12)             |
| R13 | Identical items are merged in a run (added 2026-11-12)                                        |
| R14 | Finished runs are never listed among active runs or where runs are started (added 2026-11-12) |
| R15 | Light and dark theme, defaulting to the browser's system setting (added 2026-11-12)           |

## 2. Requirements analysis

What the requirements left open, ordered by how much each point changes the architecture, and how
it was decided.

### 2.1 Where does "checked" live? — Decided (D1, D10)

"Reusable" and "checked as done" pull against each other. If checking _Tent_ in _Motorcycle
vacation_ stores the check on the item itself, then:

- it is also checked in _Camping gear_ and in every other list that includes it;
- after the trip someone has to uncheck everything before the list can be reused;
- two people packing for two different trips from the same list overwrite each other.

**Decision: separate the reusable list from a use of it.**

- **List** — reusable, editable, composable. Has no check state.
- **Run** — one use, e.g. "Alps trip, June 2027". Started with one tap ("Start run" on a list),
  checked off by one or several people, then gone.

**Runs are used once (R9).** Starting one copies the list's current items into it (D2),
so the run owns its items. They can be checked, skipped, edited and removed, and more can be added
— even a whole other list ("also bring the camping gear this time"), whose items are copied in as
a new section. None of that touches the reusable lists.

**Merging (D16, R13):** when lists are copied into a run, identical items become one run item —
_Basic_ and _Camping_ both listing "Headlamp" gives one "Headlamp", shown as coming from both.

**Checked items (D12)** stay in place, struck through. A toggle moves them into a "Done" section
while it's on.

**Finishing (D10, R14):** when every item is checked or skipped, the run finishes and disappears.
The snackbar offers Undo, which reverts the last check. Finished runs appear nowhere — not among
active runs and not where runs are started. They are kept for 30 days, so that offline devices can
still sync changes to them, and then purged (D15). There's no history of past runs in v1
(deferred, §8). Edge case: an ad-hoc shopping run whose items are all checked finishes too, even if
more items were about to be added — Undo covers it.

**Ad-hoc runs (R8):** a run can also start empty — "New run" on the Runs page — with items added
straight into it. Checking, sharing, offline use and finishing work as for any other run. It can
be saved as a reusable list from its menu (D13), but the app never suggests or requires that. In
the data model it is a run without a source list.

_Rejected alternative:_ one built-in check state per list and a **Reset** button. No two concurrent
uses of the same list, and runs would be hard to add later.

### 2.2 What does composition mean exactly? — Decided (D2)

- **Reference or copy?** Live includes between lists: fixing _Basic travel gear_ once fixes every
  list that includes it. A run copies the list's items when it starts, since it's used once (§2.1).
  A separate "Duplicate list" action covers forking a list: one `list.duplicate` mutation
  (the client picks every new id), so the copy appears complete, everywhere, and never half-made.
  "Save as list" on a run (D13) works the same way: one `run.saveAsList` mutation creates a new
  list with copies (title, quantity, note) of the run's live items in the order the run shows
  them (by section, the Done toggle ignored); checked and skipped items are copied too, the run
  is unchanged. Afterwards the run stays open and the notice offers "Open" for the new list.
- **Nesting:** any depth (A includes B includes C). The graph must stay free of cycles. Offline
  edits can create a cycle neither client could see (Anna adds A → B while Ben adds B → A); the
  server rejects whichever arrives second, and that client is told why. A list includes another
  list at most once; a second include of the same list is rejected the same way (also when two
  clients add it offline).
- **Diamonds:** if _Hostel_ and _Camping_ both include _Toiletries_, it appears **once**.
- **Same item in two lists:** _Basic_ and _Camping_ both contain "Headlamp". In the lists they stay
  two separate items, each shown under its source list. In a run they are merged into one (D16).
- **Exceptions:** "camping gear, but without the camping chair". A real need for packing lists, but
  it adds a whole concept. Deferred (§8); in v1, skip or remove the item in the run, or split the
  list.
- **Sections:** a list's entries are an ordered mix of its own items and included lists. Included
  lists therefore act as sections, so v1 needs no separate "categories" feature.
- **Editing through a composite:** items of included lists appear under a header naming their
  source. Editing one edits the source, and the UI says "also used in 3 other lists".
- **Deleting an included list:** goes to the trash (soft delete). Lists that include it show a
  "deleted list" placeholder until it's restored or purged. Deleting never needs to be blocked,
  which keeps it safe when people edit concurrently. A list in the trash may still be included,
  and its includes still count for the loop check, so restoring it can never bring a loop back.
  (The refusal names the lists, e.g. "“A” already contains “C”", even when the path runs through
  a list in the trash.)

### 2.3 Users, sign-in and sharing — Decided (D3, D9, D14)

Self-hosted for a small circle (R10, R11):

- **Admins manage accounts:** create (username, display name, temporary password), edit, delete,
  grant and revoke admin. There's no self-registration and there are no invite links. The last
  admin can't be deleted or demoted.
- **First admin:** on first start, the server logs a one-time setup token; using it creates the
  first account, which is an admin.
- **Sign-in:** username and password (hashed with Node's built-in `crypto.argon2`, so no native
  dependency), or a passkey.
- **Passkeys** (WebAuthn, via SimpleWebAuthn 14): users add, name and remove their own passkeys in
  their profile, and the sign-in page offers "Sign in with a passkey". Passkeys are bound to the
  domain, so the app must know its public URL (D4); `localhost` works in development.
  The relying-party id is the host of `PUBLIC_URL` and the expected origin is its origin (without
  `PUBLIC_URL`: `localhost` and the dev server's origin). Passkeys are discoverable credentials
  with required user verification, so sign-in needs no username and is as strong as a password;
  it makes the same session as the password, forced password change included. The server keeps the
  WebAuthn challenges in memory: single use, valid for 5 minutes, at most 10 pending per client
  address (sign-in) or per user (adding a passkey), so nobody can crowd out anyone else's, and
  at most 1000 in all. Failed passkey sign-ins count against the same per-client limit as
  password sign-ins. A passkey that is removed, or whose user is deleted, stops working at once.
  Resetting a user's password to a temporary one (D9) removes all their passkeys, in the same
  transaction that ends their sessions; the user adds new ones after changing the password.
- **Forgotten passwords (D9):** an admin sets a temporary password that must be changed at the next
  sign-in; a server command covers the case where no admin can sign in. Both also end the user's
  sessions and remove their passkeys.
- **Sessions:** httpOnly cookie, valid for 90 days and renewed on use (D15).

**Sharing between users (D14):** spaces — a personal space per user, plus shared spaces (e.g.
"Family") whose owners add existing users. Sharing individual lists was rejected: it gets tangled
with composition (can I include a list you shared with me? what happens to my list when you
unshare it?).

Rules (T-024): a space is managed over REST, not synced. Every account gets a personal space when
it is created (and one for accounts that predate spaces, by migration); it can be renamed, but
not shared, left or deleted, and it is deleted with its user. The owner of a shared space renames
it, adds members by username, removes members and deletes it; a member can leave; the owner can
neither leave nor be removed (delete the space instead; there's no hand-over yet). A caller who
isn't in a space gets 404, so ids can't be probed. When a user is deleted, a shared space they
owned passes to its longest-standing member (deleted with everything in it if nobody else is in
it), so shared spaces keep their content.

Web client (T-026): the app asks `GET /api/auth/me` on every guarded navigation and remembers the
user on the device. A 401 sends people to sign-in; an unreachable server keeps them in the app, so
it works offline after the session has ended. When the sync socket is refused with "Sign in first",
the sync status says "Sign in" instead of "Offline", the app keeps working and keeps its pending
changes, and the user is asked once to sign in; signing in loads the app afresh, so the same user's
pending changes sync, and another user's data is wiped from the device first. Signing out asks
first when changes are unsynced, ends the session and wipes the device's database; it needs a
connection. Sign-out deletes the whole local database (spaces, rows, outbox, sync cursors) and the
remembered space; device preferences such as the theme stay. If another user signs in on a device
that still holds someone else's data (known from the user id the welcome stored), the database is
wiped before the first sync, so the old outbox is never pushed under the new session, and the new
user is told how many unsynced changes were discarded. The same user keeps everything. Users edit only their own display name (`PATCH /api/auth/me`); usernames and the
admin flag stay with admins. The chosen space is remembered per device (`localStorage`).

_Rejected alternatives:_ a public service with open sign-up (email verification, password reset
over SMTP, abuse protection, GDPR); no accounts at all (link-based, no "checked by Anna", no access
control beyond the URL).

### 2.4 Conflict rules for offline edits — Decided (D5)

Real-time editing alone is easy. Offline editing makes conflicts unavoidable: two people change the
same thing while one of them is offline. These rules are predictable and don't rely on device
clocks:

| Situation                                                      | Outcome                                                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Edits to different fields of the same item                     | Both kept (changes are per field)                                                     |
| Edits to the same field                                        | The one that **reaches the server last** wins                                         |
| Check vs. uncheck of the same item in a run                    | Same rule                                                                             |
| A run finishes while someone adds or unchecks an item          | It's open again: a run counts as finished only while every item is checked or skipped |
| The same item added to a run on two devices (one offline)      | Merged into one (D16); the other id stays as an alias, so its changes (a check) apply |
| Edit vs. delete                                                | Delete wins; the editor sees "deleted by Ben" and can restore it                      |
| Changes to a deleted list's items, or new items in it          | Delete wins too: ignored (acknowledged without effect) until the list is restored     |
| Concurrent inserts or reorders                                 | Both kept; order by fractional position keys, ties broken by id                       |
| Change that breaks a rule (cycle, no permission, invalid data) | Server rejects it; the client rolls it back and shows a short notice                  |

_Rejected alternative:_ "last **edited** wins", using device timestamps. More intuitive after long
offline periods, but it needs hybrid logical clocks and trusts device clocks.

### 2.5 Offline-first is an architecture, not a feature — Decided

To work offline, the UI reads and writes a **local database in the browser**, never the server
directly. Every change is a _mutation_: applied locally at once, queued, and sent to the server
when possible. Real-time updates and catching up after being offline then use the same path. This
has to be the design from the first feature; adding offline support to a REST CRUD app later means
rewriting its data layer.

Consequences:

- **Sync only runs while the app is open.** Only Chromium-based browsers support Background Sync,
  and iOS has nothing equivalent. Changes made offline reach others the next time the app is
  opened online, so the UI shows "3 changes not synced yet".
- **Browsers can evict local storage**, Safari especially for sites that aren't installed. The
  server is the source of truth: we request persistent storage, and only unsynced changes are at
  risk.
- **Several tabs:** one tab runs the sync engine (chosen with the Web Locks API). All tabs read the
  same IndexedDB and update live.
- **Session expires while offline:** the app keeps working locally, and queued changes are sent
  after signing in again.
- **Old app, new server:** the service worker may serve a cached older version of the app. The sync
  protocol is versioned, changes to it are additive, and the server can ask a client to update.
  An old client drops tables and fields it doesn't know while its sync position moves on, so the
  client version that adds a synced table or field clears the sync position (a Dexie upgrade):
  its next pull is a full snapshot and nothing it skipped is lost.
- **Two schemas** (SQLite on the server, IndexedDB in the browser) must evolve together. Both come
  from shared domain types.

### 2.6 PWA details — Decided

- **HTTPS:** service workers and passkeys need it (except on `localhost`). Traefik terminates TLS in
  front of the app (D4), so the app itself only speaks HTTP.
- **Manifest:** name "Lister", standalone display, maskable icons (D11), theme colour from the
  Material theme, optional shortcuts ("New list", "New run").
  The manifest's `background_color` is the light surface, so dark-mode Android users see a light
  splash screen; the manifest can't follow the colour scheme (accepted, T-003 review).
- **Service worker** (`@angular/service-worker`) caches the app shell and assets only. Data lives in
  IndexedDB, not in the SW cache. `/api/**` and `/socket.io/**` are excluded from the navigation
  fallback, so that e.g. export downloads still reach the server.
- **Updates:** a "New version available — Reload" snackbar (`SwUpdate`).
- **Install:** install prompt on Chromium; on iOS, a short "Share → Add to Home Screen" hint, since
  there's no install API there. `InstallPrompt` (`util-pwa`) keeps Chromium's `beforeinstallprompt`
  event (`providePwa()` keeps one that fires before the service's chunk has loaded), and the
  Space page's **App** section offers "Install app", which opens it. On iOS Safari
  (not other iOS browsers) a one-time snackbar explains the steps (flag in `localStorage`), and
  the App section keeps the same text. Nothing is offered when the app already runs standalone.
- **Persistent storage:** "first real use" means signed in with the first sync finished
  (`lastSyncedAt` is set). Then `FirstUse` (in `lister-web`, since `util-pwa` can't depend on the
  sync engine) calls `navigator.storage.persist()` and the iOS hint. The sync position is stored,
  so a refusal is retried at every start; the last refusal is remembered (`localStorage`), so
  the App section doesn't say "not requested yet" before asking again. The App section shows
  granted / not granted / not supported / not requested yet.
- The service worker is disabled in dev builds, so offline behaviour is tested against the
  production build.

### 2.7 Material Design details — Decided

- Angular Material 22 (Material 3). CDK drag-drop for reordering, CDK layout for breakpoints.
- Angular Material has **no navigation bar or navigation rail** component (checked against the v22
  entry points). We build two small ones in `web/ui` with the M3 system tokens (`--mat-sys-*`).
- **Layout:** on phones a top app bar, a bottom navigation bar (Lists / Runs / Space) and a FAB for
  "add". On tablets and desktops a navigation rail and a two-pane list/detail view.
- Light and dark theme following the system, plus a manual toggle. Both are generated from the
  deep teal seed colour `#00796B` (D11) with Angular Material's `theme-color` schematic.
- **Self-host fonts and icons** (Roboto, Material Symbols, from npm). Material's `ng-add` loads them
  from Google Fonts, which breaks offline use and sends visitors' IPs to Google (a GDPR concern
  in the EU).
- **Snackbar with Undo** after deletes and after a run finishes; progress bar for packing progress.
  Snackbars go through one queue (`Notifier`): a newer notice cuts the current one short after
  1.5 s, so none is lost and the latest Undo comes quickly.
- **Decided in T-010 (differs from the mock-ups):** the page's FAB stays at the bottom right of
  the content from 600 px too, instead of moving into the rail, because the action belongs to the
  page and the rail is the shell's. It's an extended FAB ("New list") at every width. List rows
  are cards with an initial avatar, at most 720 px wide. On phones the top app bar shows the
  destination's name and the page heading is only for screen readers.
- CDK drag-drop has no built-in keyboard reordering, so items also get "Move up / down" in their
  menu.

### 2.8 Features a list app usually needs — Decided

None of these change the architecture; the table says what goes into v1.

| Feature                                                                          | Decision                                                     |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Item fields: quantity ("Socks × 5"), note                                        | v1: title, optional quantity (empty = 1), optional note (D6) |
| Reorder items and included lists                                                 | v1 (drag & drop + menu)                                      |
| Paste several lines to create several items                                      | v1 (cheap, big win)                                          |
| Trash, restore, undo                                                             | v1 (sync needs soft deletes anyway)                          |
| Runs: skip, "Done" section toggle (D12), progress, add items or lists to one run | v1                                                           |
| Merge identical items in a run                                                   | v1 (D16)                                                     |
| Ad-hoc runs: start empty, add items, check once                                  | v1 (R8)                                                      |
| "Checked by Anna · 14:02"                                                        | v1 (comes free with accounts)                                |
| Duplicate a list                                                                 | v1                                                           |
| Save a run as a list                                                             | v1, as an optional action (D13)                              |
| Run history ("what did we take last time?")                                      | deferred: runs are gone once done (D10)                      |
| Presence ("Ben is looking at this list")                                         | later                                                        |
| Assign items to people                                                           | later                                                        |
| Search, tags, favourites                                                         | later                                                        |
| Import/export (JSON, Markdown), print view                                       | later                                                        |
| Languages                                                                        | English only (adding i18n later touches every page)          |
| Push notifications                                                               | not planned                                                  |

### 2.9 Operations — Decided (D4)

- **One origin, one process:** Nest serves the built Angular app, `/api` and `/socket.io` from one
  container with one SQLite file. That means simple cookies, no CORS and one thing to deploy.
  Trade-off: no horizontal scaling (SQLite plus in-memory socket rooms). That's fine for a
  self-hosted app; Postgres plus a Socket.IO adapter would be the way out if that ever changes.
- **Behind Traefik (D4):** the container listens on plain HTTP (`PORT`); Traefik terminates TLS
  and forwards requests and WebSockets. The app trusts the proxy's `X-Forwarded-*` headers (client
  IPs for rate limiting, the original scheme) and is configured with `PUBLIC_URL` (e.g.
  `https://lister.example.org`). That URL drives the WebSocket `Origin` check, `Secure` cookies,
  and the passkey relying-party id and origin.
- **Docker:** a multi-stage Dockerfile in the repo; non-root; the database on a volume; a health
  check. The README shows an example `docker-compose.yml` with Traefik labels.
- **Backups** with SQLite's online backup (nightly `VACUUM INTO`, after 03:00 UTC, into
  `BACKUP_DIR`, default `backups` beside the database, `/data/backups` in Docker); the last 14 are
  kept (D15). Restoring: `node main.js restore-backup <file>` (refused while another connection,
  i.e. the server, has the database open) migrates a copy of the backup, sets every space's
  `version` and `purged_version` to one above the highest version of any space in the backup or the
  live database, deletes every session, then swaps it in (spaces created after the backup are gone).
  So versions are never reused and every device pulls a snapshot, even one whose version the space
  has passed again. The bound is global because a space deleted after the backup (deleted for good)
  is missing from the live database; it only fails for a device offline across both that deletion
  and the restore of a space that had out-versioned every other space. Sessions go because the
  backup still holds those ended since (sign-out, password change, revoked sign-ins); the same user
  keeps their pending changes across the new sign-in. Documented in the README.
- **Purge** (D15, daily, right after the backup, `feature-maintenance`): tombstones and runs
  finished or deleted more than 30 days ago are deleted for good, with the items and includes of
  a purged list and the items of a purged run. A space that lost rows moves one version on, and
  that version becomes `spaces.purged_version`, its purge point; a pull with `since` below it is
  answered with a full snapshot (§4.2). So every device of the space snapshots once, the
  up-to-date ones too: they still hold the purged tombstones, and the live items and includes of
  a purged list, which no change told them about. Nothing is poked (an empty poke would move a
  client past the purge point); connected devices see the version gap at the next change. The
  client stores no purge point, so no Dexie change. The jobs run from a timer checked every 15 minutes (no
  scheduler library) and record the last purge day in `app_meta`; an in-memory database runs
  none (tests).
- **Security:** authorize every mutation (space membership) and every admin endpoint; check the
  `Origin` header on the WebSocket handshake (cookie-authenticated sockets can otherwise be
  hijacked cross-site); refuse HTTP writes (anything but GET, HEAD, OPTIONS) whose `Origin` isn't
  `PUBLIC_URL`'s or whose body isn't JSON (`SameOriginGuard`: `SameSite=Lax` alone allows login
  CSRF with a plain form, and CSRF from sibling subdomains); rate-limit sign-in and mutations;
  cap message sizes; Content Security Policy (T-032: the build's inline scripts are allowed by hash through Angular's `security.autoCsp` `<meta>` policy; the server adds the rest of the policy, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy` and, behind https, HSTS on every response). The socket handshake needs a live session cookie
  (§4.2), and every pull and push checks the user's membership of the space in the database.

## 3. Domain model

Shown with spaces (D14), live includes and runs that copy their items (D2).

```
User ──* Passkey
User *──* Space                    Membership: owner | member (D14)

Space ──* List ──* Item            item belongs to exactly one list
  │       └──* Include ──> List    ordered edge parent → child; no cycles
  │
  └──* Run ··> List                where it was started from; none for ad-hoc
         └──* RunItem              copied at start, or added to this run only;
                                   unchecked | checked | skipped, by whom, when
```

Every synced row (lists, items, includes, runs, run items) has: `id` (UUIDv7, generated on the
client so it can be created offline), `space_id`, `version` (see §4.2), `deleted_at` (tombstone),
`created_by`, `updated_by` and timestamps. Accounts, passkeys and sessions stay on the server;
clients only get the display names of the members of their spaces.

| Table                   | Main columns                                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `users`                 | username, display name, password hash, admin flag, must-change-password flag                                                 |
| `passkeys`              | user, credential id, public key, sign counter, transports, name, created at, last used at                                    |
| `sessions`              | user, expiry                                                                                                                 |
| `spaces`, `memberships` | space name, current version; role                                                                                            |
| `lists`                 | title, description (icon/colour deferred, §8)                                                                                |
| `items`                 | list, title, quantity, note, position                                                                                        |
| `includes`              | parent list, child list, position                                                                                            |
| `runs`                  | source list (none for ad-hoc), title, finished at                                                                            |
| `run_items`             | run, title, quantity, note, position, sources (the lists it came from; the first decides its section), state, changed by, at |
| `processed_mutations`   | mutation id, client id, result (fast path for retries)                                                                       |

**Ordering:** lists are shown by title (ignoring case and accents, numbers by value: "List 9"
before "List 10"; ties by id), so they have no position and no
`list.move`. Items and includes of a list share one position key space (fractional-index strings),
so an included list can sit between items. Run items have their own positions.

**Flattening** — one pure function, used by client and server alike, to show a list with its
included lists and to copy a list into a run:

1. Walk the list's entries in position order.
2. Item → emit it, together with its source list.
3. Include → recurse into the child list unless it was already visited (this removes diamonds and
   also guards against cycles).

`flatten()` returns the items (what a run copies); `flattenEntries()` is the same walk with a
section entry for every include (what the editor shows): `live` with its entries, `deleted` for a
list in the trash (the placeholder) or `repeated` for a list already shown above.

**Starting a run:** the client flattens the source list from its local database and sends one
mutation that creates the run and its items, so starting works offline. Adding a list to an active
run copies that list's flattened items in as a new section.

**Merging (D16)** happens whenever items enter a run: when it starts, when a list is added, and when
an item is added by hand. Two items are identical when their titles match, ignoring case and
surrounding spaces. The merged item:

- keeps the larger quantity, where an empty quantity counts as 1. Different text quantities that
  aren't plain numbers are joined ("2 pairs, 1 pair"), so nothing is lost;
- joins the notes;
- lists every source list, and appears in the section of the first one;
- is unchecked again if the merge raised the quantity of an item that was already checked.

The merge rule is one shared pure function, like flattening. Run mutations (`run.start`,
`run.addItems`) carry the items in order; the shared rule merges them and appends the rest after
the run's last item, so every client computes the same positions. An item that merges into another keeps its id
as an alias (a removed row with `mergedInto`), so changes made to it elsewhere, e.g. a check made
offline, land on the merged item. Restoring a removed item merges it into an identical item that
entered meanwhile, so a run never shows the same item twice.

**Finishing:** a run counts as finished while every item is checked or skipped and it has at least
one item. The server recomputes this in the same transaction as every run-item change, and clients
apply the same shared rule for the optimistic UI. Unchecking or adding an item reopens the run.

## 4. Architecture

### 4.1 Overview

```
 Browser (PWA)                                        Server (one Node process)
┌───────────────────────────────────────┐            ┌────────────────────────────────────────┐
│ Angular UI (Material 3, signals)      │            │ NestJS (plain HTTP behind Traefik)     │
│   │ read: Dexie liveQuery → signals   │            │  ├ REST /api: sign-in, passkeys,       │
│   │ write: mutation                   │            │  │   users, spaces, export, health     │
│   ▼                                   │            │  ├ Socket.IO gateway                   │
│ Local DB (IndexedDB via Dexie)        │ Socket.IO  │  │   push mutations → ack              │
│   server rows + pending outbox        │◄──────────►│  │   pull rows since version           │
│   ▲                                   │ (WebSocket)│  │   poke changed rows to the space    │
│   │ apply / rebase                    │            │  ├ Mutation rules (applyMutation)      │
│ Sync engine (one tab, via Web Locks)  │            │  └ Drizzle → SQLite (WAL)              │
│                                       │            │ Static hosting of the web build        │
│ Service worker: app shell cache       │            └────────────────────────────────────────┘
└───────────────────────────────────────┘
```

### 4.2 Sync protocol

Clients send **mutations** (what the user did, per field). The server sends back **changed rows**
(the resulting state), tagged with a per-space **version** counter. This is the push / pull / poke
model of Replicache-style sync engines, carried over a WebSocket.

No operation log is needed. Each row stores the version of its last change, so catching up is
`SELECT … WHERE space_id = ? AND version > ?` per table, and deletions travel as tombstones.

```
client                                     server
  │ connect (cookie, Origin) ────────────────►│ session cookie → user, check Origin; else refused
  │ hello {protocolVersion, clientId} ───────►│ join the rooms of the user's spaces
  │◄─────────── welcome {spaces + members}    │ (again whenever memberships change)
  │ pull {spaceId, since: v} ────────────────►│ rows with version > v, or a full snapshot
  │◄─────────── rows…, version: v2            │   if v predates the purge point
  │ push [{mutationId, spaceId, name, args}] ►│ each mutation in one SQLite transaction:
  │                                           │   authorize → validate → apply → version + 1
  │◄─────────── ack {mutationId, version}     │   or reject {mutationId, reason}
  │                                           │ broadcast changed rows to the space's room
  │◄─────────── poke {rows, version}          │ (also for other clients' mutations)
```

- **Idempotent:** mutations _set_ values (checked = true, quantity = "5") and never toggle or
  increment. Creates use client ids. A retry after a dropped connection is therefore harmless;
  `processed_mutations` just answers it faster.
- **Ordered:** the SQLite driver is synchronous and Node is single-threaded, so mutations are
  applied strictly one at a time. Handlers must not `await` inside the transaction. Each
  transaction gets the next version of its space, and pokes go out in version order. A client that
  sees a gap (version > last + 1) pulls.
- **Local copies:** the client keeps the server's rows as last received (`serverLists`,
  `serverItems`) apart from what the UI shows (`lists`, `items`): server rows with the pending
  outbox mutations re-applied. Rebase and rollback rebuild the affected visible rows from the
  server copy, so they never need a re-pull.
- **Optimistic UI:** the client applies its own mutation locally at once. When server rows arrive,
  it stores them and re-applies its still-pending mutations on top (rebase). A mutation leaves the
  outbox once the client has seen its version. If the server rejects it, the client drops it,
  restores the server state and shows a snackbar.
- **Shared rules:** mutation schemas (Zod) and the apply logic live in a shared library used on
  both sides, so the client's prediction and the server's result agree.
- **Failures:** the server disconnects the socket after `updateRequired`, on a protocol violation
  (invalid message, pull or push before hello, a space the user isn't in) and when storage fails
  during a pull or push. A storage failure sends **no** reject, so the mutation stays in the
  outbox and is retried; a `reject` is only ever a final verdict on that mutation. After a
  server disconnect Socket.IO doesn't reconnect by itself: the client reconnects with backoff and
  starts again with hello and a pull. A pull whose `since` is ahead of the server (restored or
  reset database) gets a full snapshot, which replaces the client's copy.
- **Authentication and authorization:** the handshake needs the session cookie of a live session
  (and a user who isn't forced to change their password), or the connection is refused; the
  `Origin` check stays. The welcome lists the spaces of the user's memberships with the members'
  display names. Authorization never relies on what the socket remembers: every pull and push
  asks the database whether the user is a member (a non-member's pull is a protocol violation;
  their push is rejected with "You can't change this space", without revealing whether the space
  exists), and every message re-checks that the session is still alive. Rows are stamped with the
  signed-in user. When memberships change over REST (add, remove, leave, delete, rename),
  the server moves the affected users' connected sockets in or out of the space's room at once
  and sends each a fresh welcome; the client drops every space missing from it, with its rows,
  sync position and pending changes. A session that ends (sign-out, password change or reset,
  deleted account) ends its connections at once (`AccountEvents` from `feature-auth`), and the
  members of a deleted or renamed user's spaces get a fresh welcome. Every poke also checks the
  sessions of the sockets it reaches and disconnects those that ended or expired, so no change
  ever reaches a signed-out device.
- **Rooms:** one Socket.IO room per space. A space's data is small, and offline use needs all of it
  anyway. Per-list rooms only for presence, later.

Why not a CRDT library or a ready-made sync product:

| Option                         | Why not, for Lister                                                                                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Yjs / Automerge (+ Hocuspocus) | Excellent for text documents. But data on the server becomes opaque blobs, so server-side rules (no cycles, permissions, composition, finishing runs) and SQL queries get hard, and we'd still need our own model on top. |
| TinyBase (MergeableStore)      | Table-shaped CRDT with WebSocket sync and SQLite persistence; a close fit. But it has no place for server-side validation, rejection or per-space authorization.                                                          |
| RxDB                           | A full client database with replication; heavy, and several useful plugins are paid.                                                                                                                                      |
| ElectricSQL, PowerSync, Zero   | Built around Postgres; ruled out by SQLite.                                                                                                                                                                               |

A small custom engine (row versions plus mutations) is a few hundred lines per side, keeps the data
relational in SQLite, and implements exactly the rules in §2.4.

### 4.3 Server (NestJS)

- **WebSockets:** Socket.IO via `@nestjs/websockets` and `@nestjs/platform-socket.io` 11.x (to match
  Nest 11). Socket.IO rather than raw `ws`, because it provides reconnect with backoff,
  heartbeats, acks with timeouts, rooms and handshake auth, which are the parts that are easy to
  get subtly wrong. The transport can be limited to WebSocket only.
- **Database:** Drizzle ORM 0.45 with `better-sqlite3` 13. It bundles prebuilt binaries, so there's
  no compile step, and its synchronous API gives the ordering guarantee above. Migrations come from
  drizzle-kit and run at startup. Pragmas: `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout`,
  `synchronous=NORMAL`. Node 26's built-in `node:sqlite` is an option once Drizzle supports it in a
  stable release; that support is only on its 1.0 pre-release line so far.
- **Auth:** session cookie (httpOnly, SameSite=Lax, `Secure` when `PUBLIC_URL` is https); password
  hashes with `crypto.argon2`, built into Node 26; passkeys with `@simplewebauthn/server` 14
  (relying-party id and origin from `PUBLIC_URL`); admin-only endpoints for user management.
- **Proxy:** Express `trust proxy` for Traefik's `X-Forwarded-*` headers.
- **Static hosting:** serves `dist/apps/lister-web/browser` with SPA fallback.

### 4.4 Web (Angular)

- **Local database:** Dexie 4 on IndexedDB. Dexie `liveQuery` results become Angular signals, and
  changes from other tabs arrive automatically.
- **Sync engine:** a root service using `socket.io-client`. It exposes signals for `online`,
  `syncing`, `pendingCount`, `lastSyncedAt`, `errors` (refused changes not yet shown) and `errorLog` (the last 20, kept after they were shown), `updateRequired` (starts the service worker update flow via `AppUpdates`) and a `syncNow()` action (any tab can ask; the leader pulls and pushes, or reconnects at once). The Space page shows them.
- **Ids and order:** UUIDv7 via `uuid`; fractional positions via `fractional-indexing`.
- **Passkeys:** `@simplewebauthn/browser` 14.
- **PWA:** `@angular/service-worker` (added with `@angular/pwa`), plus `navigator.storage.persist()`.
- **Dev:** the dev-server proxy forwards `/socket.io` with `ws: true`.

## 5. Monorepo structure

```
apps/
  lister-web               Angular shell: routes, layout, providers
  lister-web-e2e           Playwright, incl. multi-user, offline and passkey scenarios
  lister-api               Nest bootstrap, module wiring, static hosting; integration tests
                           for every route and socket event
  lister-api-e2e           Vitest: smoke tests against the built server
packages/
  shared/
    domain                 entities, flatten(), cycle check, positions                  scope:shared type:util
    sync-protocol          mutation schemas and rules, messages, protocol version       scope:shared type:util
    api-contracts          REST types (exists)                                          scope:shared type:util
  api/
    data-access-db         Drizzle schema, migrations, DB provider                      scope:api type:data-access
    feature-auth           sessions, sign-in, passkeys, user administration, guards     scope:api type:feature
    feature-spaces         spaces, memberships                                          scope:api type:feature
    feature-maintenance    nightly backups, daily purge of tombstones and finished runs scope:api type:feature
    feature-sync           gateway, push/pull/poke, MutationService                     scope:api type:feature
  web/
    data-access-local-db   Dexie schema, repositories → signals                         scope:web type:data-access
    data-access-sync       sync engine, outbox, socket, status, SpaceChanges           scope:web type:data-access
    data-access-auth       who is signed in, sign-in/out calls, route guards           scope:web type:data-access
    feature-lists          list library, list editor, composition                       scope:web type:feature
    feature-runs           runs: start, ad-hoc, check/skip, progress, finishing         scope:web type:feature
    feature-auth           sign-in, first-run setup, profile with passkeys              scope:web type:feature
    feature-admin          user administration (admins only)                            scope:web type:feature
    feature-space          space switcher, spaces and members, sync status              scope:web type:feature
    ui                     nav bar/rail, item row, section header, sync status, dialogs scope:web type:ui
    util-pwa               SW updates, install hint, storage persistence, online signal scope:web type:util
    util-notify            Notifier: the snackbar queue (Undo, rejections, prompts)     scope:web type:util
    util-theme             theme preference (system/light/dark), theme-color meta tags  scope:web type:util
```

Conventions that follow from this (also in `CLAUDE.md`):

- **Every bigger feature is its own library** from its first line of code: one with its own route
  or page, controller or gateway, entity, table or mutation type, or more than a few components
  or services. The apps only wire libraries together. A new library is added to the tree above
  in the same change.
- **Module boundaries are strict.** `@nx/enforce-module-boundaries` bans imports across scopes
  and up the layers, including npm packages that belong to the other side, transitive
  dependencies and circular dependencies. `npm run lint:workspace` checks tags, placement and
  import aliases. A violation is fixed by moving code, never by loosening a rule.
- **Zod** is allowed in `shared/*` libraries (still no Angular, Nest, Node or browser-only imports),
  so mutation and message schemas are defined once and validated on the server. HTTP request
  bodies keep using class-validator DTOs.
- Synced data (lists, items, includes, runs, run items) is read from the local database and changed
  through mutations — never through REST CRUD or `httpResource()`. HTTP stays for sign-in,
  passkeys, user administration, spaces, bootstrap, export and health.

## 6. Testing strategy

Required for every change (the `testing` skill has the details):

- **Unit tests** for every new or changed unit, on the web side, the API side and in shared code.
- **Integration tests for every backend call**: each HTTP route and Socket.IO event goes through
  the real app (`AppModule` with `main.ts`'s setup) over real HTTP or a real socket, against a
  fresh migrated in-memory SQLite database. They cover the happy path and the failures (validation,
  authentication, authorization, not found, rejected mutations, retries).
- **A Playwright happy path for every user-facing feature**, at phone and desktop widths, with an
  axe accessibility check.

On top of that:

- **Convergence tests** for the sync rules: simulate several clients making random edits with random
  disconnects (property-based, fast-check), then assert that everyone ends with the server's state.
- **Domain rules** (flattening, merging identical items, finishing): plain unit tests with many
  small cases.
- **API:** integration tests against in-memory SQLite (real SQL, still fast); `lister-api-e2e`
  only smoke-tests the built server (startup, migrations, health, static hosting, origin check).
- **Web:** the sync engine with a fake socket and `fake-indexeddb`; components with TestBed.
- **Types:** Vitest and Playwright don't type-check, so every project has a `typecheck` target
  (`tsc --noEmit` on its app/lib and spec tsconfigs, inferred by `tools/typecheck-plugin.mjs`).
  CI runs `nx affected -t lint typecheck test build e2e`.
- **E2E (Playwright):**
  - two browser contexts on the same list or run (real time);
  - `context.setOffline(true)` → edit → back online → both converge;
  - the app shell offline, against the production build;
  - passkeys with a virtual authenticator (Chromium's WebAuthn DevTools domain).

## 7. Order of work

Tracked in [TASKS.md](../TASKS.md); every task names its milestone.

1. **M1 Foundations (T-001 – T-005):** Material 3 theme and app shell (nav bar/rail); PWA
   (manifest, icons, service worker, update prompt, self-hosted fonts); SQLite with Drizzle and
   migrations; the shared `domain` and `sync-protocol` libraries.
2. **M2 Sync walking skeleton (T-006 – T-014):** lists and items stored locally first; push / pull
   / poke; offline outbox; the API serves the web build from one origin; two-browser and offline
   e2e tests. Used a single dev user and space until T-025 (real accounts and memberships).
3. **M3 Composition (T-015 – T-018):** live includes, cycle rejection, sections, trash and
   restore, duplicating lists.
4. **M4 Runs (T-019 – T-021):** start from a list or ad-hoc, merging identical items, check and
   skip, the "Done" section, progress, adding items or lists to one run, finishing, saving as a
   list.
5. **M5 Accounts and spaces (T-022 – T-027):** sign-in, the admin role and user administration,
   spaces, socket auth and authorization, passkeys.
6. **M6 Collaboration polish (T-028 – T-031):** "checked by", undo, rejection notices, sync status,
   install hint.
7. **M7 Deployment (T-032 – T-033):** Docker image for Traefik, backups, purging tombstones and
   finished runs.

Sync comes second on purpose: it's the riskiest part, and every later feature is new mutation types
on top of it.

## 8. Deferred

Deliberately not in v1. To pick one up, add a task to `TASKS.md`, and update this document first if
it changes a decision above.

- Per-composition exceptions ("camping gear, but without the chair")
- Run history ("what did we take last time?") — runs are gone once done (D10)
- Pulling list changes into an active run
- Presence ("Ben is looking at this list")
- Assigning items to people
- Search, tags, favourites
- An icon or colour per list (deferred in T-005; additive later: a column, a Dexie bump and an
  optional row field, which old clients ignore; the Dexie version that adds it forces a snapshot, §2.5)
- Import/export (JSON, Markdown), print view
- Self-registration and invite links (admins create accounts)
- Languages other than English
- Push notifications (not planned)
