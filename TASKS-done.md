# Lister — Finished tasks

Tasks closed from [TASKS.md](TASKS.md), newest first. Moved out of TASKS.md on 2026-11-18 so
the backlog stays short to read.

### T-069 — Keep exceptions when duplicating, exporting and importing

- Completed: 2026-11-18 — `list.duplicate` copies include exceptions; JSON export carries per-include `exceptions` and item ids (format v1), import maps them and drops unknown or repeated targets; `list.import` creates them; in `shared-sync-protocol`, `shared-list-transfer`, `web-feature-lists`
- Review: Approve with minor fixes; 2 fixed (1 substantive, 1 trivial), 0 skipped, 0 disagreed; re-review rounds: 0 (coordinator re-review pending)
- Milestone: M10 Leaving out
- Area: shared, api, web
- Priority: low
- Depends on: T-067
- Decisions: D24, D28
- Done when:
  - `list.duplicate` copies the exceptions of the copied list's includes, with new ids.
  - The JSON export carries each include's exceptions as an optional `exceptions` field (format
    version 1 unchanged); importing maps them to the new ids and drops those whose target isn't
    in the file; files without the field import as before.
  - The Markdown export and print show the flattened view (no left-out entries).
  - Tests: unit tests for the export schema and import mapping, an integration test for
    `list.duplicate` and `list.import` with exceptions, a Playwright check that a duplicated list
    keeps a left-out item hidden.

### T-068 — Leave out in the list editor

- Completed: 2026-11-18 — "Leave out of <list>" in the entry menus and the "N left out" rows (per section and for the list's own includes) with Put back, Undo and focus handling, in `web-feature-lists` (list editor); icon subset updated
- Review: Changes requested; 9 fixed (4 substantive, 5 trivial), 0 skipped, 0 disagreed; re-review rounds: 0 (coordinator re-review pending)
- Milestone: M10 Leaving out
- Area: web
- Priority: normal
- Depends on: T-067
- Decisions: D28
- Done when:
  - In the list editor, items and nested-list rows that come from an included list have a menu
    (Edit for items, plus **Leave out of <list>**); the list's own items don't get the action.
    Choosing it hides the entry and shows the notice "“<title>” left out of <list>" with Undo.
  - Each section with left-out entries says "N left out" in its header and ends with a
    collapsed "N left out" row; expanded, it lists them struck through, a left-out list with its
    item count, each with **Put back** (notice with Undo) or, when inherited, "Left out in
    <list>" linking to that list.
  - The included (source) list itself shows nothing about exceptions; item counts on the Lists
    page follow the flattened view.
  - Keyboard and screen-reader use work (menu, expanded state, labels); axe passes in both themes.
  - Tests: component unit tests for the menu, the left-out row and the inherited case; a
    Playwright happy path that leaves out an item, sees it gone, starts a run without it, and
    puts it back.
- Notes: mockup in `tmp/mockups/leave-out.html` (local, not committed).

### T-067 — Leave out: synced exceptions and flattening

- Completed: 2026-11-18 — synced `include_exceptions` table (Drizzle migration 0013, Dexie version 9), `include.addException` / `include.removeException` in the shared `applyMutation()`, `flatten()` / `flattenEntries()` skip left-out entries (reported as `leftOut`), runs don't copy them, purge removes them; shared-domain, sync-protocol, api data-access-db / feature-sync / feature-maintenance, web data-access-local-db / data-access-sync
- Review: Changes requested; 2 fixed (1 substantive, 1 trivial), 0 skipped, 0 disagreed; re-review rounds: 0 (coordinator re-review of the substantive fix pending)
- Milestone: M10 Leaving out
- Area: shared, api, web
- Priority: normal
- Depends on: —
- Decisions: D28
- Done when:
  - A new synced table `include_exceptions` (include, target kind `item` | `list`, target id, plus
    the usual synced columns) exists on the server (Drizzle migration) and on the client (Dexie
    version bump that forces a snapshot, design §2.5).
  - `include.addException` and `include.removeException` behave as design §3 "Leaving out"
    says: validated against the space (include and target exist, kind matches), adding is a
    no-op while a live exception for the pair exists, removing tombstones every live row for the
    pair; applied by the shared `applyMutation()` on both sides.
  - `flatten()` and `flattenEntries()` skip left-out items and lists below any reachable include
    (leaving out wins across paths, carried through further includes), and `flattenEntries()`
    reports each skipped entry with its section and the list that owns the exception.
  - Starting a run, or adding a list to a run, doesn't copy left-out entries.
  - Purge removes exceptions whose include or target is purged, and old tombstoned exceptions.
  - Tests: unit tests for the mutations and the flattening rules (direct, nested list, inherited,
    diamond where paths disagree, inert target, restored include); integration tests for both
    mutations over Socket.IO (including rejection for a target in another space) and for purge.
- Notes: no UI yet; T-068 builds it. Two commits (API, web data access), per the coordinator
  workflow.

### T-066 — Test factory for local space rows

- Completed: 2026-11-18 — `makeLocalSpace` (web `LocalSpace` row, typed structurally) added to `@lister/shared/testing` and used by 12 web specs instead of hand-written space literals; listed in the `testing` skill
- Review: Approve with minor fixes; 3 fixed (0 substantive, 3 trivial), 0 skipped, 0 disagreed; re-review rounds: 0
- Milestone: M9 Data and finding things
- Area: web (tests only)
- Priority: low
- Depends on: T-065
- Decisions: none
- Done when:
  - Web specs build local `Space` rows (`{ id, name, version, members }`) through a factory
    such as `makeLocalSpace({ ... })` with sensible defaults, instead of each spec writing its
    own full object literal (about 8 specs: `list-editor-page`, `search-field`,
    `all-items-page`, `space-page`, `sync-engine`, `local-db`).
  - The factory lives with the other factories (`@lister/shared/testing`) if the type allows it
    under the `module-boundaries` skill, otherwise in a web test-only helper, and the `testing`
    skill lists it.
  - Values a test relies on stay explicit overrides; behaviour and coverage are unchanged;
    `verify` passes.
- Notes: Found by the T-065 review (`tmp/reviews/T-065.md`, "Outside this task"). Pure refactor
  of tests; no production code changes.

### T-065 — Shared test factories for users, spaces and synced rows

- Completed: 2026-11-18 — new test-only library `@lister/shared/testing` (`makeUser`, `makeSpaceSummary`, `makeSpaceMember`, `makeList`, `makeItem`, `makeInclude`, `makeRun`, `makeRunItem`) used by ~38 web and api specs; `lint:workspace` keeps it out of production code; documented in the `testing` and `module-boundaries` skills
- Review: Approve with minor fixes; 4 fixed (1 substantive, 3 trivial), 0 skipped, 0 disagreed; re-review rounds: 1
- Milestone: M9 Data and finding things
- Area: shared, web, api (tests only)
- Priority: normal
- Depends on: T-064
- Decisions: none
- Done when:
  - Specs build `CurrentUser`, space summaries/members and the synced row types (list, item,
    include, run, run item) through factories such as `makeUser({ ... })` with sensible defaults,
    instead of each spec writing its own full object literal.
  - Adding a required field to one of these types needs a change in one factory, not in every
    spec (T-064 had to touch about 12 specs for `visibleToOthers`).
  - The factories live in a test-only library placed by the `module-boundaries` skill (web specs
    never import api code and vice versa), and are documented in the `testing` skill.
  - Existing specs that build these literals use the factories; behaviour and coverage are
    unchanged; `verify` passes.
- Notes: Suggested by the T-064 task worker's context analysis (2026-11-18). Pure refactor of
  tests; no production code changes.

### T-064 — Suggest users when adding a member to a space

- Completed: 2026-11-18 — opt-in "Visible to other users" profile switch (migration 0012) and a rate-limited, member-checked `GET /api/user-search` (`api/feature-auth`), with Material autocomplete suggestions in the new Add member dialog (`web/feature-space`)
- Review: Changes requested; 8 fixed (3 substantive, 5 trivial), 0 skipped, 0 disagreed; re-review rounds: 0
- Milestone: M5 Accounts and spaces
- Area: shared, api, web
- Priority: normal
- Depends on: none
- Decisions: D27
- Done when:
  - Profile (Settings › Account) has a "Visible to other users" switch, off by default and off for
    existing accounts (migration), explained as "Others can find you when they add members to a
    space". It works only online, like the other profile fields.
  - In "Add a member", typing 2+ characters suggests visible users whose username or display name
    contains the text (ignoring case and accents), at most 10, showing display name and username;
    picking one fills the username. Users already in the space and the caller are not suggested.
  - A user who isn't visible can still be added by typing their exact username, as today; the
    dialog never reveals whether a hidden username exists before Add is pressed.
  - The search endpoint needs a signed-in user, returns only visible users (username, display name,
    id), is rate-limited like other auth endpoints, and validates its query (a DTO; `api-contracts` holds
    the types and limits).
  - Suggestions don't flicker while typing (debounced; previous results kept until new ones arrive)
    and the field works with keyboard and screen readers (Material autocomplete).
  - Tests: API unit + integration tests for the visibility flag and the search (hidden users never
    returned, limit, matching); web unit tests for the profile switch and the dialog; a Playwright
    happy path where one user turns visibility on and another finds and adds them.
- Notes: Requested by the user 2026-11-18. Today `addMember` uses the generic field dialog in
  `packages/web/feature-space/src/lib/spaces/spaces-section.ts`; it likely needs its own dialog.
  Design §2.5 and §4.1 already mention D27. Zod was dropped for the query: importing it in
  `api-contracts` put it in the web app's main bundle (over budget), and the other REST DTOs use
  class-validator.

### T-063 — Diagnostic log for connection problems, exportable from Settings → App

- Completed: 2026-11-18 — always-on, bounded, batched IndexedDB diagnostic log (`web/util-diagnostics`) of everything that decides online/offline, with Settings → App export (Web Share or download) and clear (with Undo)
- Review: Changes requested; 9 fixed (6 substantive, 3 trivial), 0 skipped, 0 disagreed; re-review rounds: 1
- Milestone: M9 Data and finding things
- Area: web
- Priority: high
- Depends on: T-062
- Decisions: none
- Done when:
  - The web app keeps a verbose diagnostic log on the device, always on, persisted in IndexedDB so
    it survives reloads and browser restarts, bounded (e.g. the newest 5,000 entries or 7 days,
    whichever is smaller), and written without slowing the app down.
  - Every step that decides whether the app is online is logged with a timestamp, the tab/window
    id and whether this tab leads sync: browser `online`/`offline` events and `navigator.onLine`;
    `visibilitychange`, `pagehide`/`pageshow` (persisted or not), freeze/resume; the sync engine's
    state changes (each `online`/`syncing` change and why); the Web Lock (`lister-sync`) requested,
    acquired, released, stolen, aborted; every Socket.IO attempt: connect, `connect_error` (message,
    `type`, `description`, transport), disconnect reason, reconnect attempt/backoff, transport
    upgrade, handshake/hello/welcome, pull and push (counts, versions, acks, rejects with reason);
    every REST call the app makes (bootstrap, health, auth/session: method, path, status, duration,
    network error); the session/auth state as the app sees it; the service worker (registration,
    version, update found/activated, controller change, whether a response came from the cache).
    Whatever drives the "offline / API unavailable" status shown to the user is logged with the
    exact condition that set it.
  - Nothing private is logged: no list or item text, no passwords, cookies, tokens or passkey
    material; ids, counts, status codes and reasons only (same rule as the API's debug log, §2.9).
  - Settings → App has "Export diagnostic log": it downloads (or on mobile shares via the Web
    Share API when available, with download as fallback) one file named with the date. The file
    starts with a header: app version and build, service worker version/state, user agent,
    platform, standalone (installed PWA) or browser tab, `navigator.onLine`, storage persisted,
    the current sync state, and the server time offset if known. It works while the app is
    offline. "Clear diagnostic log" is next to it. Both are usable on a phone.
  - Entries carry the socket id (and anything else the API logs with `LOG_LEVEL=debug`), so the
    export can be matched line by line against the server's debug log.
  - Tests: unit tests for the log store (bounding, persistence, redaction) and for the sync
    engine/auth/PWA events writing entries; a Playwright happy path that goes offline and back,
    exports the log from Settings → App and finds the connect, disconnect and reconnect entries in
    the downloaded file.
- Notes: Reported by the user: on mobile the connection randomly stops working and stays in the
  "offline, API unavailable" state; switching networks or restarting the browser doesn't help.
  Earlier related work: T-052 (stuck offline after sign-in rounds; Web Lock and bfcache fixes). The
  goal of this task is evidence, not a fix: once the user sends an export, a follow-up task pins
  down the cause. Put the logger in its own web library (e.g. `web/util-diagnostics`, `module-boundaries`
  skill) so sync, auth and PWA code can write to it; add it to docs/design.md §5 and describe the
  log in §2.9/§4.4.

### T-062 — Print without blank pages

- Completed: 2026-11-18 — the shell's print overrides moved into app.scss (they lost to its component styles), so the shell flows over the pages; print colour scheme forced light over a theme picked in Settings; Chromium `page.pdf()` and Firefox `window.print()` e2e checks
- Review: Changes requested; 4 fixed (3 substantive, 1 trivial), 0 skipped, 0 disagreed; re-review rounds: 1

- Milestone: M9 Data and finding things
- Area: web
- Priority: high
- Depends on: T-059
- Decisions: D24
- Done when:
  - Printing a list or a run (T-059's Print action) gives exactly the pages its items need: no
    blank page before or after the list, in Chromium and Firefox, on A4 and Letter, on phone and
    wide layouts, in light and dark theme.
  - The printed sheet starts at the top of the first page; nothing of the app shell (nav bar or
    rail, top bar, search, snackbars, the FAB, dialogs' backdrops) takes up space on paper.
  - A long list (more than one page) breaks between items, never through one, and keeps a group
    heading with its first item.
  - Tests: a Playwright check that renders the print media of a list and of a run as a PDF
    (`page.pdf()`, Chromium) and asserts the page count for a short list is 1 and its text is on
    page 1; a long list's count matches its length.
- Notes: Reported by the user: one empty page before and one after the printed list. Likely the
  print styles in `apps/lister-web/src/styles.scss` and the shell hide the app with `visibility`
  or leave fixed/100vh/min-height containers in the flow; fix the `@media print` styling at its
  root rather than adding page-break hacks.

### T-061 — A colour and icon per list

- Completed: 2026-11-17 — optional colour (12 tones) and icon (40 Material Symbols) per list (D26): `shared/domain` sets, `list.update` patch, migration 0011, Dexie v8, `ListAvatar` and `ListAppearanceDialog` in `web/ui`, shown on Lists, list header, included lists and runs
- Review: Changes requested; 6 fixed (4 substantive, 2 trivial), 0 skipped, 0 disagreed; re-review rounds: 1

- Milestone: M9 Data and finding things
- Area: web, api, shared
- Priority: low
- Depends on: T-016
- Decisions: D26
- Done when:
  - In a list's menu, **Colour and icon** lets members pick (or clear) them as D26 decides; the
    choice syncs to other devices like any field (per-field last write wins, D5).
  - The Lists page, the list header and included-list sections show them; both themes keep
    sufficient contrast (axe passes).
  - Synced as optional fields: a Drizzle migration, a sync-protocol field, a Dexie version bump
    that forces a snapshot (design §2.5); clients without the field ignore it.
  - Tests: unit tests for the mutation, an integration test for the new field over sync, a
    Playwright happy path that sets a colour and icon and sees them on the Lists page.

### T-060 — Search

- Completed: 2026-11-17 — search field in the app bar on Lists and Runs (D25): `search()` in `shared/domain`, `Repositories.searchDataOfSpace()`, new `web/feature-search` library, shell wiring
- Review: Changes requested; 9 fixed (5 substantive, 4 trivial), 0 skipped, 0 disagreed; re-review rounds: 1

- Milestone: M9 Data and finding things
- Area: web
- Priority: normal
- Depends on: T-055
- Decisions: D25
- Done when:
  - A search field finds lists, items and runs as D25 decides, from the local database (works
    offline, updates live as data changes), ignoring case and accents.
  - Results are grouped and each opens the page it belongs to; an item result names its list.
  - Keyboard (`/` focuses search, arrows and Enter pick a result, Escape clears), accessible, fits
    a 320 px phone.
  - Tests: unit tests for matching and ranking; a Playwright happy path that searches for an item
    and opens its list.
- Notes: Query in `data-access-local-db`, matching in `shared/domain` (reuse T-056's matching where
  it fits).

### T-059 — Export, import and print lists

- Completed: 2026-11-17 — client-side export (Markdown, JSON, all lists), import (Markdown/text, Lister JSON via the atomic `list.import` mutation) and print of lists and runs; new libs `shared/list-transfer` and `web/feature-transfer`.
- Review: Changes requested; 8 fixed (4 substantive, 4 trivial), 0 skipped, 0 disagreed; re-review rounds: 1
- Milestone: M9 Data and finding things
- Area: web, shared
- Priority: high
- Depends on: T-016, T-020, T-048
- Decisions: D24, D18, D2
- Done when:
  - A list's menu offers **Export as Markdown** and **Export as JSON**; each downloads a file named
    after the list. Markdown: the title as `#`, its items as `- ` lines with quantity and note,
    each included list as a sub-heading with its items (a list reached twice appears once, D2).
  - The Space page offers **Export all lists (JSON)**: every non-trashed list of the space, with
    items and includes.
  - Exports are built from the local database in the browser: they work offline and add no API
    endpoint. The JSON has a format version and holds the exported lists plus every list they
    include; it is validated by a Zod schema in a shared library.
  - The Lists page offers **Import**: picking a `.md` or `.txt` file creates one new list (title
    from the first `#` heading, else the file name), one item per line with bullets and `[ ]` /
    `[x]` boxes stripped, as a paste does (D18). Picking a Lister `.json` export creates new copies
    of all its lists in the current space, with new ids and includes remapped among them; existing
    lists are never changed, and a list whose include target is missing from the file keeps no
    include. An invalid or unsupported file shows a clear error and creates nothing.
  - Imports go through sync-engine mutations (no REST), so they work offline and appear on other
    devices; an import that would break a rule (cycle, limits) is rejected as a whole, not half done.
  - **Print** on a list prints every item, grouped by included list; **Print** on a run prints its
    items with their check state. The print stylesheet hides the navigation, menus and buttons and
    fits A4 and Letter.
  - Tests: unit tests for Markdown and JSON export, both import parsers (round trip JSON export →
    import), id remapping and invalid files; a Playwright happy path that exports a list as JSON,
    imports it as a copy, and opens the print view of a list.
- Notes: New library for export/import (e.g. `packages/web/feature-transfer`, add it to design §5);
  the format schema and conversion functions belong in `shared/domain` or a new shared library
  with no browser APIs. Reuse the paste parser from T-048. Design §4/CLAUDE.md still list "export"
  among the REST uses; adjust the wording to say export is client-side (D24).

### T-056 — Autocomplete when adding an item

- Completed: 2026-11-17 — Autocomplete in the add-item field of lists and runs: `suggestTitles()` in `shared/domain`, `Repositories.itemTitles()`, shared `AddItemField` in `web/ui`, used by `feature-lists` and `feature-runs`.
- Review: Changes requested; 3 fixed (3 substantive, 0 trivial), 0 skipped, 0 disagreed; re-review rounds: 1

- Milestone: M8 Editing conveniences
- Area: web
- Priority: normal
- Depends on: T-016, T-020
- Decisions: D22
- Done when:
  - Typing in the add-item field of a list (and of a run) offers the titles of existing items
    in every space the user belongs to (D22), matching what was typed anywhere in the title,
    ignoring case; titles that are identical by the D16 rule are offered once.
  - Items in the trash, and items already in this list (or run), are not offered.
  - Choosing a suggestion (mouse, touch, or arrow keys and Enter) adds an item with that title
    only, no quantity or note (D22), as typing the title and pressing Enter does today. Enter
    without a chosen suggestion still adds exactly what was typed, and Escape closes the
    suggestions without adding.
  - Suggestions come from the local database (signals), so they work offline and stay current.
  - Angular Material autocomplete (`mat-autocomplete`), accessible (announced options, visible
    focus), at most a handful of suggestions at a time, and it fits a 320 px wide phone with the
    on-screen keyboard open.
  - Tests: unit tests for the matching (dedup, exclusions, ranking: titles that start with the text
    first), and a Playwright happy path that adds an item to a list by choosing a suggestion.
- Notes: The suggestion query belongs in `data-access-local-db`; share one suggestion component
  between `feature-lists` and `feature-runs` (in `web/ui` if it takes the titles as an input and
  touches no data itself).
- Open question for the user: should titles that exist only in runs also be suggested? D22 currently means list items only.

### T-055 — All items, A–Z, with the lists that contain them

- Completed: 2026-11-17 — Read-only "All items" page (`/lists/items`) linked from Lists: `indexItems()` in `shared/domain`, `Repositories.itemIndexOfSpace()`, `AllItemsPage` in `feature-lists`.
- Review: Changes requested; 3 fixed (2 substantive, 1 trivial), 0 skipped, 0 disagreed; re-review rounds: 1

- Milestone: M8 Editing conveniences
- Area: web
- Priority: normal
- Depends on: T-016, T-049
- Decisions: D21
- Done when:
  - An "All items" view, opened from the Lists page, lists every item of the current space's lists
    (D21), in alphabetical order (the existing list-title collator, `sortByTitle()` in
    `shared/domain`).
  - Identical items (D16 rule: titles match ignoring case and surrounding spaces) are one row; next
    to each row are the lists that contain it, each a link that opens that list.
  - Items and lists in the trash are left out; an item reached only through an include is listed
    under the list it belongs to, not under the lists that include it.
  - The view updates live as lists and items change on any device (local database signals, no
    REST), and works offline.
  - It fits a 320 px wide phone (long titles and many lists wrap, nothing is cut off) and has an
    empty state.
  - Tests: unit tests for the grouping and sorting (in `shared/domain` or the repository), and a
    Playwright happy path: two lists sharing an item, the view shows it once with both lists, and
    a list link opens that list.
- Notes: A read-only view over existing data: no mutation, no schema change. Add a repository
  query in `data-access-local-db` rather than reading Dexie from the feature. It probably belongs
  in `feature-lists` as a route; if it grows beyond one page, give it its own library
  (`module-boundaries`).

### T-054 — Finished runs in the trash, with Restore

- Completed: 2026-11-16 — `run.restore` mutation (unchecks the item checked last) and finished runs listed in Space › Trash with who finished them and when, with Restore; `shared/domain`, `shared/sync-protocol`, `web/data-access-local-db`, `web/feature-space`, design doc updated.
- Review: Changes requested; 3 fixed (1 substantive, 2 trivial), 0 skipped, 0 disagreed; re-review rounds: 1
- Milestone: M8 Editing conveniences
- Area: web, api, shared
- Priority: normal
- Depends on: T-017
- Decisions: D10 (changes), D20
- Done when:
  - When the last item of a run is checked or skipped, the run still disappears from the active
    runs, with Undo in the snackbar as today, and it then shows in Space › Trash next to deleted
    lists and items, with who finished it and when, for 30 days (D15).
  - Restore on a finished run brings it back among the active runs, with the item checked last
    unchecked again (D20), on every device of the space (a synced mutation, not REST).
  - A finished run older than 30 days is no longer listed and is purged as today.
  - D10, R14, §2.1 "Finishing" and the trash rules in `docs/design.md` say that finished runs are
    in the trash, and that nothing else lists them (not among active runs, not where runs start).
  - Tests: a unit test for the restore rule in `sync-protocol`, an integration test for the
    mutation, and a Playwright happy path: finish a run, find it in Trash, restore it, check it
    is active again.
- Notes: Finishing is derived today (§3, "a run counts as finished while every item is checked or
  skipped"), so restoring with every check kept would finish the run again at once. D20: Restore
  unchecks the item checked last. Whoever finished a run is the user whose check finished it (the
  run's last change); a column may be needed (Drizzle migration plus Dexie version bump).

### T-058 — Registration links handed out by admins

- Completed: 2026-11-16 — Admins create, copy and remove one-time registration links (Settings › Users); `/register` creates a regular user signed in at once (`api/feature-auth`, `web/feature-admin`, `web/feature-auth`, migration 0010).
- Review: Changes requested; 5 fixed (3 substantive, 2 trivial), 0 skipped, 0 disagreed; re-review rounds: 1
- Milestone: M8 Editing conveniences
- Area: web, api, shared
- Priority: high
- Depends on: T-023, T-026, T-050
- Decisions: D23, D3 (changes)
- Done when:
  - Under Settings › Users, admins (and only admins: the section and every endpoint answer
    non-admins with 403, signed-out callers with 401) can create a registration token: 12
    characters A–Z and 0–9 from a cryptographically secure source, stored in the database (a
    Drizzle migration; no Dexie change, it is not synced data).
  - Each token is shown as a link `<PUBLIC_URL>/register?token=<TOKEN>` (the page's own origin
    when `PUBLIC_URL` is unset), with a button that copies the link to the clipboard and confirms
    it with a snackbar (`Notifier`).
  - Admins see every unused, unexpired token with when it was created, by whom, and when it
    expires (7 days after creation, D23), and can remove one (it stops working at once).
  - Opening the link shows a registration page like first-run setup (token prefilled from the
    URL and editable, username, display name, password with the same rules as setup); the token
    is accepted ignoring case and surrounding spaces. Registering creates a regular user (not an
    admin) with a personal space and signs them in straight into the app.
  - A token works once: registering deletes it in the same transaction that creates the account,
    so two simultaneous registrations with one token can't both succeed. Wrong, used, removed or
    expired tokens get one clear error, and failed attempts count against the same per-client
    rate limit as sign-in. Expired tokens are deleted by the daily purge (T-033) and never listed.
  - A taken username gives the same error as when an admin creates a user.
  - Tests: unit tests for token generation and normalization; integration tests for create, list,
    remove (admin, non-admin, signed out) and register (success, case-insensitive, reused,
    removed, expired, rate limit, username taken); a Playwright happy path: an admin creates a
    link, copies it, a new browser context opens it, registers, lands in the app as a non-admin,
    and the token is gone from the admin's list.
- Notes: Reuse the setup page's form and the account creation of `UsersService` / `AuthService`
  rather than copying them; registration belongs in `api/feature-auth` and the admin UI in
  `web/feature-admin`. The register route sits next to `/setup` and `/sign-in` (no auth guard).
  Update the API contracts in `shared/api-contracts` with `apiPath()` routes. docs/design.md §2.3
  and D23 were updated when the task was added.

### T-051 — Loading spinners instead of jumping Space sections

- Completed: 2026-11-16 — Space sections no longer jump: shared `LoadingSpinner` in web/ui, device-first Members section with a reserved box, Data section waits for the device's spaces (`web/feature-space`, `web/ui`, e2e)
- Review: Changes requested; 3 fixed (2 substantive, 1 trivial), 0 skipped, 0 disagreed; re-review rounds: 1
- Milestone: M8 Editing conveniences
- Area: web
- Priority: normal
- Depends on: T-026
- Done when:
  - Opening Space (cold load, and coming back to it) no longer makes the "Spaces" list or the
    "Members of …" section jump: while their data loads, each shows a Material progress spinner
    (`mat-progress-spinner`, indeterminate, with an accessible label such as "Loading spaces")
    in a box that keeps its place, and the content replaces the spinner without moving the
    sections around it.
  - Data that is already known (e.g. spaces from the sync welcome, or a refresh of a list that
    already shows) is shown at once, without a spinner coming back on refresh.
  - The spinner only appears after a short delay (about 300 ms), so a fast load shows no spinner
    flash.
  - A load error still shows the existing error text in place of the spinner.
  - A Playwright check with the members request slowed down sees the spinner, then the members,
    and the headings after the section keep their vertical position (layout-shift check).
- Notes: Find what jumps first with the `ui-review` skill's flicker checks (throttled network,
  screenshots during load). If T-050 is done first, the same applies to any section it moved;
  if a spinner pattern is needed elsewhere, put a small shared component in `web/ui`.

### T-057 — An include added during a paste ties with an item, and Sort A–Z then moves it

- Completed: 2026-11-16 — `sortByTitle()` keeps includes in place when tied with an item (fresh keys on the right side, neighbouring ties kept apart); `addList()` creates the include in the `adding` chain after pasted items (`shared/domain`, `web/feature-lists`; `sort.spec.ts` waits for the paste)
- Review: Changes requested; 3 fixed (1 substantive, 2 trivial), 0 skipped, 0 disagreed; re-review rounds: 1
- Milestone: M8 Editing conveniences
- Area: web, shared
- Priority: high
- Depends on: T-049
- Done when:
  - Adding a list to a list right after pasting several items (before they have all shown) puts the
    include after every pasted item, never on the same position key as one of them.
  - "Sort A–Z" keeps every include in its slot even when the include shares its key with an item
    (a tie that two devices adding at the end while offline can also produce, design §2.4).
  - `sort.spec.ts` "sorts a list A–Z with Undo, keeping its included list in place…" passes in
    the full web e2e run, phone and desktop, and under CPU throttling.
  - Tests: a unit test for `sortByTitle()` with an include tied to an item slot (start, middle and
    end of the list), a list-editor unit test that an include created while `addItems()` is still
    running goes after the queued items, and the e2e spec waits for the first paste to show
    before adding the list.
- Notes: Found in the T-050 review (`tmp/reviews/T-050.md`, finding 8, with probe evidence).
  `list-editor-page.ts` places the include at `positionAtEnd(this.currentRows())` (rendered rows
  only), while `addItems()` writes its items one by one in the `this.adding` chain; under load the
  include gets e.g. `a0` next to `Tent@a0`. `sortByTitle()` re-keys ties among the sorted rows only,
  so a slot tied with one of `others` is handed to another item and the include changes place.
  Fix both: create the include inside the `adding` chain (counting the rows it added), and have
  `sortByTitle()` treat a slot equal to an `others` key as tied and give it a fresh key on the
  correct side.

### T-050 — Settings destination with sign-out

- Completed: 2026-11-16 — Settings destination (`packages/web/feature-settings`): account links, appearance, sync, app, about and sign out moved off Space and the profile page; Profile and Users at `/settings/…` with redirects; fourth navigation destination
- Review: Approve with minor fixes; 7 fixed (0 substantive, 7 trivial), 0 skipped (finding 8 → T-057), 0 disagreed; re-review rounds: 0
- Milestone: M8 Editing conveniences
- Area: web
- Priority: normal
- Depends on: T-026, T-030
- Decisions: D19
- Done when:
  - The navigation bar (phone) and rail (desktop) show a fourth destination, "Settings" with the
    gear icon, after Space; it is highlighted on every page under `/settings`.
  - Settings shows Account (Profile; Users only for admins), Appearance, Sync status, App
    (install, update) and About, and a "Sign out" button at the bottom that signs out as it does
    today. The profile page no longer has its own sign-out button.
  - Space shows only the space switcher, spaces and members, and Trash.
  - Profile and Users open at `/settings/profile` and `/settings/users`; `/space/profile` and
    `/space/users` redirect there, and every in-app link, guard and redirect (sign-in return URL,
    forced password change, admin guard) points to the new paths.
  - The four destinations fit the navigation bar at 320 px wide without truncation.
  - Existing e2e specs that used the old paths or found these sections on Space pass against the
    new layout.
- Notes: Per the `module-boundaries` skill the Settings page gets its own library
  (`packages/web/feature-settings`, `scope:web,type:feature`, add it to design §5 and the
  CLAUDE.md layout); move the sync, app and about sections out of `feature-space` rather than
  duplicating them. Run `subset-icons` for the `settings` icon.

### T-052 — Sign-out and sign-in rounds: no redirect, then stuck offline

- Completed: 2026-11-16 — sync engine aborts/releases its Web Lock on `pagehide`, leads again on a persisted `pageshow`, steals a lock that is pending with no holder (`web/data-access-sync`; `sign-in-rounds` e2e). The original "no redirect on the second sign-out" symptom is still unverified, pending the user's check on the Docker deployment.
- Review: Changes requested; 5 fixed (4 substantive, 1 trivial), 0 skipped, 0 disagreed; re-review rounds: 1
- Was blocked: not reproducible locally (2026-11-16: 5–25 rounds in Playwright, dev and the PWA setup
  over plain HTTP on :3100, one and two users, two tabs, all fine). The user saw it on the **Docker
  deployment behind Traefik (HTTPS)**, so the local-port explanation is out. Next: with T-053 done,
  reproduce against the Docker image behind an HTTPS reverse proxy (`Secure` cookies,
  `PUBLIC_URL` Origin check, WebSockets through the proxy, service worker on a real origin) and
  collect the user's `LOG_LEVEL=debug` server log plus browser console and network output from a
  stuck state. Also check the sync engine's Web Lock (`lister-sync`) when an installed PWA window
  or a bfcached page still holds it.
- Evidence 2026-11-16 (debug log, Docker): after wiping site data, sign-in → handshake, hello,
  welcome, pull; sign-out → server disconnects the socket; then **no handshake attempt at all**,
  neither on the `/sign-in` page after sign-out (it should be refused: "no session cookie") nor
  after the next sign-in. So the client never calls `socket.connect()`: the engine doesn't lead.
  Prime suspect: the signed-in page, its socket just closed by the server, enters the bfcache on
  `location.assign('/sign-in')` still holding `lister-sync`, frozen (its reconnect timer never
  fires); every later page waits for the lock.
- Lock state 2026-11-16: `navigator.locks.query()` in the stuck tab gave `held: []` and **three
  pending** `lister-sync` requests (three client ids). Nobody holds the lock, yet no request is
  granted. Opening the site in a new tab doesn't help (it just queues behind them); no console
  errors. So the pending requests of pages that are gone or frozen (earlier rounds' documents)
  block the queue, and the engine waits forever on a lock it never gets.
- Fix (both parts): (1) don't leave requests behind: on `pagehide` abort a pending request
  (`signal` on `navigator.locks.request`), release a held lock and close the socket; on
  `pageshow` with `persisted` request it again (the engine must be able to lead again, unlike
  the final `stop()`). (2) Never wait forever: while this page is waiting, check
  `navigator.locks.query()` every few seconds; if `lister-sync` is pending but held by nobody,
  take it with `steal: true`. Unit tests with a fake `SYNC_LOCKS` and dispatched
  `pagehide`/`pageshow` events; a Playwright regression of five sign-out/sign-in rounds that
  expects "synced" each time (also `*.pwa.spec.ts`).
- Milestone: M8 Editing conveniences
- Area: web
- Priority: high
- Depends on: T-026
- Done when:
  - Sign out, sign in again (same or another user), then press "Sign out": the session ends and
    the sign-in page loads, every time, also on a third and fourth round. Reported by the user
    2026-11-16: on the second sign-out the redirect to sign-in doesn't happen.
  - The same holds in the production/PWA setup (service worker active), not only in dev.
  - A Playwright regression test does sign out → sign in → sign out → sign in → sign out and
    expects the sign-in page and a refused session each time (`*.pwa.spec.ts` too if the cause is
    service-worker related).
  - After five sign-out/sign-in rounds the app connects and shows synced, not "offline", also
    after a reload and after closing and reopening the browser. Reported by the user
    2026-11-16: after a few rounds the connection "bricks" and stays offline even after a
    browser restart, so something persisted (IndexedDB `meta`, e.g. the saved sync status or
    sync position, localStorage, the sync engine's tab lock or reconnect back-off, or the
    service worker) survives the session.
  - A device already in that stuck state recovers by itself on the next sign-in or page load,
    without clearing site data.
  - The regression test also reopens a fresh browser context on the same storage after the
    rounds and expects the app online and syncing.
  - A unit test covers the root cause.
- Notes: Diagnose first (`mattpocock-skills:diagnosing-bugs`); don't guess. The path is
  `ProfilePage.signOut()` → `AuthSession.signOut()` (`packages/web/data-access-auth/src/lib/auth-session.ts`:
  logout POST → `db.clearAll()` → `remember(null)` → `PageNavigator.load('/sign-in')`). Suspects:
  `clearAll()` blocked or hanging after the sync engine reopened Dexie in the new session; the
  logout POST failing (stale CSRF/origin state) and only showing `signOutError`; the
  `storage`-event listener or a guard sending the user back; the service worker answering the
  `/sign-in` navigation from a stale cache. Record the cause in the commit body.
- Implemented 2026-11-16: `SyncEngine` aborts a pending lock request, releases a held lock and closes the socket on `pagehide`, leads again on a persisted `pageshow`, and steals a lock that is pending but held by nobody (two checks in a row, every 3 s). Unit tests with a fake `SYNC_LOCKS`; Playwright `sign-in-rounds.spec.ts` and `.pwa.spec.ts` (five rounds). The original "no redirect on the second sign-out" symptom was never reproduced locally and has no separate fix: the log shows the sign-out itself worked, and the stuck lock is the only cause found.

### T-053 — `LOG_LEVEL` to turn on debug logging

- Completed: 2026-11-16 — `LOG_LEVEL` (parsed in `apps/lister-api/src/app/log-levels.ts`) and debug logging in the sync gateway, socket adapter and auth; Dockerfile, README and design §2.9 updated
- Review: Changes requested; 6 fixed (3 substantive, 3 trivial), 0 skipped, 0 disagreed; re-review rounds: 1
- Milestone: M8 Editing conveniences
- Area: api, infra
- Priority: normal
- Depends on: T-032
- Done when:
  - The API reads `LOG_LEVEL` (`error`, `warn`, `log`, `debug`, `verbose`; default `log`) and
    passes the matching Nest log levels to the app logger; an unknown value fails at start-up with
    a clear message.
  - The Dockerfile's runtime stage sets `LOG_LEVEL=log`, and a comment there (and the deployment
    notes in the README or `docs/design.md` §2.9) shows how to run with `-e LOG_LEVEL=debug`.
  - With `debug`, the API logs one line per: socket connect, handshake refusal (with the reason),
    hello/welcome, pull (space, since, snapshot or not, row count), push (space, mutation names,
    acks/rejects with reason), disconnect (with the reason), sign-in, sign-out and session expiry.
    With the default level none of these appear.
  - Debug lines never contain passwords, cookies, session tokens, passkey material or the text of
    lists and items: only ids, counts, names of mutations and reasons.
  - Unit tests for the level parsing; an integration test that, with `debug`, a push logs its
    summary and nothing secret; the CLI commands keep logging errors only.
- Notes: Use Nest's `Logger` with a context per class (`new Logger(SyncGateway.name)`), not
  `console`. This also helps diagnose problems such as T-052 on a real deployment.

### T-049 — Sort items A–Z in lists and runs

- Completed: 2026-11-16 — `list.sortItems` / `run.sortItems` mutations, `sortByTitle()` in `shared/domain`, "Sort A–Z" in the list editor, its sections and runs, and the remembered "Add at end" / "Sort in" toggle
- Review: Changes requested; 7 fixed (2 substantive, 5 trivial), 0 skipped, 0 disagreed; re-review rounds: 1
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

### T-048 — Paste items into the new-list dialog

- Completed: 2026-11-16 — `list.create` takes optional items (shared domain `cleanItemLines`, sync-protocol, apply); new `NewListDialog` in web/ui, Lists page sends one mutation; pushes are size-capped
- Review: Changes requested; 8 fixed (3 substantive, 5 trivial incl. the tab rule), 0 skipped, 0 disagreed; re-review rounds: 1
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
