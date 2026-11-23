# Lister — Design

> **Status: accepted** (2026-11-12). These decisions hold for v1. If one needs to change, change it
> here first, then update `CLAUDE.md` and `TASKS.md`. The work is tracked in
> [TASKS.md](../TASKS.md) as T-001 – T-033. Decisions that are still open are listed under
> [Open decisions](#open-decisions).

## Decisions

| #   | Topic                        | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Check state                  | Reusable **lists** have no check state; a **run** holds it. A run starts from a list or empty (ad-hoc).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| D2  | Composition                  | Lists include other lists by **live reference**: editing a list changes every list that includes it. Any depth, no cycles; a list reached twice appears once; an include can leave out items or lists below it (D28). A run **copies** the list's items when it starts, so later edits to the list don't change it.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D3  | Users                        | Self-hosted. Admins create, edit and delete accounts and can make other users admins, or hand out one-time registration links (D23); no open self-registration. Sign-in with username and password, or with passkeys that each user adds and removes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D4  | Hosting                      | A Docker container behind Traefik. Traefik terminates HTTPS; the app speaks plain HTTP and is told its public URL. The Dockerfile lives in the repo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D5  | Conflicts                    | Per field, the change that reaches the server last wins; deletes win; invalid changes are rejected with a notice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D6  | Item fields (v1)             | Title; quantity, optional free text ("2 pairs", "500 g"), where empty means 1; optional note.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| D7  | Language                     | English only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D8  | Naming                       | Code and UI: List, Item, Include, Run, Space; destinations Lists, Runs, Space, Settings (D19). "Run" may be renamed in the UI later; that only touches UI text.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D9  | Forgotten passwords          | An admin sets a temporary password, which the user must change at the next sign-in. A server command resets a password when no admin can sign in. Either reset also ends the user's sessions and removes all their passkeys, so nothing someone else added survives it; admins never see a user's passkeys.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D10 | Run lifecycle                | A run is used once. When every item is checked or skipped, it finishes and disappears from the active runs, with Undo in the snackbar. A finished run goes to the trash (Space › Trash) for 30 days (D15), with who finished it and when, and Restore brings it back (D20); nothing else lists it — not the active runs, not where runs are started. After 30 days it is purged. There is no other history.                                                                                                                                                                                                                                                                                                                          |
| D11 | Look                         | Material 3 theme seeded from deep teal `#00796B`, in light and dark. The theme follows the browser's system setting until the user picks Light or Dark in Settings › Appearance (remembered on the device). App icon: the Material Symbols "checklist" glyph on that colour. Mock-ups: https://claude.ai/artifact/RWjDQCAXmBw9FAgBTua6rC                                                                                                                                                                                                                                                                                                                                                                                             |
| D12 | Checked run items            | They stay in place, struck through. A toggle, remembered on the device, moves them into a "Done" section while it's on.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| D13 | Save a run as list           | Possible as an action on a run, but never suggested automatically and never required.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D14 | Sharing                      | Spaces. Every user has a personal space; anyone can create a shared space and add existing users. The creator owns it and manages its members; all members can edit everything in it; lists only include lists from the same space.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D15 | Time limits                  | Sessions last 90 days and renew on use; the trash and finished runs are kept for 30 days; backups run nightly and the last 14 are kept.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| D16 | Identical run items          | Merged into one. Items are identical when their titles match, ignoring case and surrounding spaces. The merged item keeps the larger quantity, not the sum (two lists needing a headlamp still means one headlamp; empty counts as 1); different text quantities are joined, and so are notes. It remembers every list it came from.                                                                                                                                                                                                                                                                                                                                                                                                 |
| D17 | Sorting A–Z                  | "Sort A–Z" is a one-off action that saves the new order for everyone in the space, with Undo. It uses the list-title order (ignoring case and accents, numbers by value). In a list, includes keep their slots and only the items around them are sorted; an included list's section has its own action, which sorts that list itself (so the change shows wherever it is included). In a run it sorts within each section. When adding an item, a choice remembered on the device puts it at the end (default) or sorts it in: before the first item, in the same list or run section, that sorts after it.                                                                                                                         |
| D18 | Pasting a new list           | The new-list dialog takes optional items, one per line. Each line is trimmed; blank lines are dropped; leading markers ("- ", "* ", "• ", "1. ", "[ ] ", "[x] ") are removed; the text becomes the title only (no quantity parsing). Identical lines (D16 rule: case and surrounding spaces ignored) are added once, the first one kept. Each run of tabs inside a line (text copied from a spreadsheet) becomes one space.                                                                                                                                                                                                                                                                                                          |
| D19 | Settings destination         | A fourth destination, **Settings** (gear icon), after Space. It holds what belongs to the user and the device, not to a space: Account (Profile; Users for admins), Appearance, Sync status, App (install, update) and About, with Sign out at the bottom (moved off the profile page). Space keeps the space switcher, spaces and members, and Trash. Profile and Users live under `/settings/…`; the old `/space/profile` and `/space/users` URLs redirect.                                                                                                                                                                                                                                                                        |
| D20 | Restoring a finished run     | Finished runs go to the trash (T-054). Restore unchecks the item checked last, like Undo, and keeps the other checks, so the run is open again among the active runs. (Answers O14, 2026-11-16.)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D21 | All-items view               | The "All items" view (T-055) covers the current space only and is opened from the Lists page. (Answers O15, 2026-11-16.)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D22 | Item autocomplete            | Adding an item (T-056) suggests the titles of items from every space the user belongs to, since all of it is on the device. A suggestion copies the title only, not the quantity or note. (Answers O16, 2026-11-16.)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D23 | Registration tokens          | Admins create one-time registration tokens under Settings › Users: 12 characters A–Z and 0–9, entered ignoring case, shared as a link `<PUBLIC_URL>/register?token=…` with a copy button. Registering works like first-run setup (username, display name, password) but makes a regular user, signed in at once with a personal space. A token is single use, expires after 7 days, is listed for admins until used, expired or removed, and is then deleted. (2026-11-16, T-058.)                                                                                                                                                                                                                                                   |
| D24 | Export, import, print        | Export is built in the browser from the local database, so it works offline and needs no endpoint: one list as Markdown (included lists as sub-headings) or JSON, and every list of the space as JSON from the Space page. A JSON export holds the chosen lists plus every list they include. Import takes a Markdown or plain-text file (one item per line, bullets and checkboxes stripped, like a paste, D18) as a new list, or a Lister JSON export, which creates new copies of all its lists in the current space with new ids and its includes remapped among them; existing lists are never changed. Runs are not exported. Lists and runs can be printed (a run with its check state). (Answers T-059 scoping, 2026-11-17.) |
| D25 | Search                       | One search field (app bar on Lists and Runs) over the current space: list titles, item titles and notes, and active runs' titles, ignoring case and accents; results grouped (Lists, Items with the list they are in, Runs), each opening its page; the trash is not searched. (Answers O17, 2026-11-17.)                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D26 | List colour and icon         | Both optional: a colour from a fixed palette of 12 Material 3 tones that work in light and dark, and an icon from a curated set of about 40 Material Symbols. Shown on the Lists page, in the list header and where the list is included; runs started from a list show its colour and icon too. (Answers O18, 2026-11-17.)                                                                                                                                                                                                                                                                                                                                                                                                          |
| D27 | Finding users to share with  | Each user chooses in their profile whether other users can find them ("Visible to other users", off by default). "Add a member" suggests visible users as you type (username or display name, from 2 characters, at most 10, showing display name and username); anyone else can still be added by typing their exact username. Admins see every user in Settings › Users as before.                                                                                                                                                                                                                                                                                                                                                 |
| D28 | Leaving out (exceptions)     | An include can **leave out** items or lists anywhere below it ("Camping gear, but without the chair"): a synced `include_exceptions` row on the include edge, naming the target by id. It applies wherever the outer list is included; when paths disagree, leaving out wins. The editor offers "Leave out of <list>" on entries from included lists and shows them in a "N left out" row with Put back (inherited ones say "Left out in <list>"). Runs copy the flattened list, so they never see the exceptions. Details §2.2, §3. (2026-11-18.)                                                                                                                                                                                   |
| D29 | Current space in the app bar | The current space's name is shown on every page, also when the user has only one space: in the top app bar on phones, and at the top of the content area next to the search field from 600 px. It is a button that opens a menu of the user's spaces to switch to (current one marked), plus a link to the Space page. The Space page keeps its switcher. (Answers the "show the current space prominently" request, 2026-11-23.)                                                                                                                                                                                                                                                                                                    |

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
- **Exception** — "leave out": an include that hides an item or list below it in this
  composition only (D28). UI words: "Leave out", "Left out", "Put back".
- **Tombstone** — a soft-deleted row (`deleted_at` set). Deletions sync as tombstones.

## Open decisions

None right now: all open decisions so far (O1–O18) are answered and recorded in the Decisions
table.

New ones get the next number. Each names the first task that needs it and has a default; if it's
still open when that task starts, Claude asks once and proposes the default. Answer in chat or
write the answer into the entry here. Claude then moves it into the Decisions table and adjusts the
affected tasks.

## 1. What Lister is

Reusable checklists — packing lists being the main use case — that can be composed from other
lists, checked off by several people in real time, and used offline as an installable PWA.

| #   | Requirement                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------- |
| R1  | Works as a PWA                                                                                              |
| R2  | Material Design                                                                                             |
| R3  | Reusable to-do lists, e.g. packing gear for travel                                                          |
| R4  | Lists composed of other lists: "Motorcycle vacation = Basic travel + Hostel + Camping"                      |
| R5  | Real-time editing over WebSockets: others see items added, removed and checked immediately                  |
| R6  | Works offline; changes sync when back online                                                                |
| R7  | SQLite as the database                                                                                      |
| R8  | Ad-hoc runs: items added just to be used and checked once (added 2026-11-11)                                |
| R9  | Runs are used once and are gone when everything is checked off (added 2026-11-12)                           |
| R10 | Admin role: admins create, edit and delete users and can make them admins (added 2026-11-12)                |
| R11 | Sign-in with username and password, and passkeys users add and remove themselves (2026-11-12)               |
| R12 | Runs as a Docker container behind Traefik, which handles HTTPS (added 2026-11-12)                           |
| R13 | Identical items are merged in a run (added 2026-11-12)                                                      |
| R14 | Finished runs are only in the trash, never among active runs or where runs are started (changed 2026-11-16) |
| R15 | Light and dark theme, defaulting to the browser's system setting (added 2026-11-12)                         |

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
The snackbar offers Undo, which reverts the last check. A finished run is in the trash (Space ›
Trash, next to deleted lists and items) for 30 days (D15), with who finished it (the user whose
check, or removal of the last unchecked item, finished it) and when; it is
not among active runs and not where runs are started. **Restore** (`run.restore`, a synced
mutation, D20) unchecks the item checked last, like Undo, and keeps the other checks, so the run is
open again on every device. After 30 days the run is purged (D15); offline devices can still sync
changes to it until then. There's no other history of past runs in v1 (deferred, §8). Edge case: an ad-hoc shopping run whose items are all checked finishes too, even if
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
- **Exceptions (D28):** "camping gear, but without the camping chair". An include can **leave
  out** items or included lists anywhere below it. The exception belongs to the include edge
  (_Weekend trip_ → _Camping gear_) and names its target by id, so it covers every place the
  target appears below that edge (items never change lists). Leaving out a list hides its whole
  subtree there. Exceptions carry through further includes: _Summer holiday_ including _Weekend
  trip_ shows it without the chair too. If two paths to the same list disagree (_Summer holiday_
  also reaches _Camping gear_ through _Beach_, without exceptions), **leaving out wins**, so the
  result never depends on the order of entries. The source list shows nothing of it.
  - _Editor:_ entries that come from an included list (items and nested-list rows) get a menu
    with **Leave out of <viewed list>**; the exception goes on the viewed list's own include on
    that entry's path. Its own items don't get it (delete them instead). A section's left-out
    entries leave it and gather in a collapsed **"N left out"** row at its end (also counted in
    the section header), struck through, each with **Put back**. Exceptions inherited from a
    list further down read **"Left out in <list>"**, link to it and have no Put back. Leaving out
    and putting back show the usual notice with Undo.
  - _Runs_ copy the flattened list (§3), so a left-out entry is simply not copied; a run knows
    nothing about exceptions. Needed after all? Add it to the run by hand.
  - _Targets that go away:_ an exception whose include or target is deleted, or whose target is
    no longer below the edge, stays and does nothing; it applies again if they come back
    (restore, re-include). Purge removes it with its include or target.
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
  grant and revoke admin. The last admin can't be deleted or demoted.
- **Registration tokens (D23, T-058):** instead of creating an account, an admin can hand out a
  one-time registration link. Whoever opens it registers like the first admin does with the setup
  token (username, display name, password), but as a regular user, and is signed in at once. The
  token is 12 characters A–Z/0–9 (case ignored on input), single use and valid for 7 days; admins
  see the unused ones under Settings › Users and can remove them. Used, removed and expired tokens
  are deleted. There is no open self-registration.
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
it, adds members by username (with suggestions from visible users, D27), removes members and deletes it; a member can leave; the owner can
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
  same IndexedDB and update live. A page that goes away (`pagehide`, also into the back/forward cache)
  leaves nothing behind: it aborts its pending lock request, releases the lock and closes the socket;
  a page restored from the cache (`pageshow` with `persisted`) asks again. A frozen page's request
  would otherwise block every later page. While a page waits, it checks `locks.query()` every 3 s and,
  when the lock is pending but held by nobody on two checks in a row, takes it with `steal` (a steal
  request carries no abort `signal`: browsers refuse the two together). A page whose lock is stolen
  (its request rejects while it leads) stops leading, closes its socket and waits for the lock again.
  A visible page that waits for the lock checks that the holder is alive, because the holder may be
  a background page that Android froze with the lock still held: it pings on a `BroadcastChannel`
  (`lister-sync-leader`, with a random id) and the leading page answers at once, saying whether it
  is visible. A frozen page runs no handlers, so no answer within 2 s means the holder is gone: the
  page takes the lock with `steal`. A visible leader's answer keeps the page waiting, so two live
  visible windows never trade the lock. A hidden leader's answer makes the page take the lock at
  once: a background page may be frozen any time later, and the visible page would get no event to
  ask again (a hidden page never asks, so the lock doesn't come back). The ping is sent on events only: when the page loads or reloads
  visible, becomes visible (`visibilitychange`), resumes (Page Lifecycle `resume`) visible, or the
  user presses "Sync now" while it waits; never while hidden, while it leads, or on a timer. When
  the frozen page thaws it finds the lock stolen and steps back as above. A frozen page that thaws
  into the front sees `resume` and `visibilitychange` before the news of the steal, so a leader
  that came to the front (and hasn't been hidden since) takes a stolen lock straight back, once;
  otherwise it would wait behind a page that is now in the background and may be frozen next.
  The diagnostic log records `lock.probe`, `lock.probe-answered`, `lock.probe-steal` and
  `lock.front-steal`.
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
  fallback (nothing is cached for them).
- **Updates:** a "New version available — Reload" snackbar (`SwUpdate`).
- **Install:** install prompt on Chromium; on iOS, a short "Share → Add to Home Screen" hint, since
  there's no install API there. `InstallPrompt` (`util-pwa`) keeps Chromium's `beforeinstallprompt`
  event (`providePwa()` keeps one that fires before the service's chunk has loaded), and the
  Settings page's **App** section offers "Install app", which opens it. On iOS Safari
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
- **Layout:** on phones a top app bar, a bottom navigation bar (Lists / Runs / Space / Settings) and a FAB for
  "add". On tablets and desktops a navigation rail and a two-pane list/detail view.
- **Space button (D29):** the current space's name is a button with a dropdown icon in the top app bar on
  phones (between the title and the search field) and at the top of the content area from 600 px (before
  the search field, which is only on Lists and Runs). It opens a menu of the user's spaces (current one
  marked) and a "Spaces…" link to the Space page. It sits in a slot of fixed width (8 rem on phones, 16 rem
  from 600 px), so the search field next to it never moves while the page loads; a longer name is cut off
  with an ellipsis and a tooltip, and the slot gives way before the search field and the sync badge do.
- Light and dark theme following the system, plus a manual toggle. Both are generated from the
  deep teal seed colour `#00796B` (D11) with Angular Material's `theme-color` schematic.
- **Self-host fonts and icons** (Roboto, Material Symbols, from npm). Material's `ng-add` loads them
  from Google Fonts, which breaks offline use and sends visitors' IPs to Google (a GDPR concern
  in the EU). The icon font is cut down to the icons in use (about 5 kB instead of 4 MB) by
  `npx nx run lister-web:subset-icons`; `npm run lint:workspace` fails when the code uses an icon
  the subset lacks. Icons are written as `<mat-icon>name</mat-icon>` (or quoted names inside its
  interpolation, or an interpolation of a value named `…icon`) and as quoted names in the value of
  a TypeScript property or variable named `…icon`, so the scanner finds them; it reports any
  other form (`fontIcon`, `svgIcon`, inline templates). The e2e `expectAccessible` check also
  fails on a visible icon the font can't draw.
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

| Feature                                                                          | Decision                                                        |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Item fields: quantity ("Socks × 5"), note                                        | v1: title, optional quantity (empty = 1), optional note (D6)    |
| Reorder items and included lists                                                 | v1 (drag & drop + menu)                                         |
| Paste several lines to create several items                                      | v1 (cheap, big win)                                             |
| Trash, restore, undo                                                             | v1 (sync needs soft deletes anyway)                             |
| Runs: skip, "Done" section toggle (D12), progress, add items or lists to one run | v1                                                              |
| Merge identical items in a run                                                   | v1 (D16)                                                        |
| Ad-hoc runs: start empty, add items, check once                                  | v1 (R8)                                                         |
| "Checked by Anna · 14:02"                                                        | v1 (comes free with accounts)                                   |
| Duplicate a list                                                                 | v1                                                              |
| Save a run as a list                                                             | v1, as an optional action (D13)                                 |
| Run history ("what did we take last time?")                                      | deferred: finished runs are only in the trash for 30 days (D10) |
| Presence ("Ben is looking at this list")                                         | later                                                           |
| Assign items to people                                                           | later                                                           |
| Search, tags, favourites                                                         | search: v1 (T-060); tags, favourites later                      |
| Import/export (JSON, Markdown), print view                                       | v1 (D24, T-059)                                                 |
| Languages                                                                        | English only (adding i18n later touches every page)             |
| Push notifications                                                               | not planned                                                     |

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
- **Logging:** `LOG_LEVEL` (`error`, `warn`, `log`, `debug`, `verbose`; default `log`, set in the
  Dockerfile too; an unknown value stops the start-up) picks Nest's log levels. With `debug` the API
  logs one line per socket connect/disconnect (with the reason), handshake refusal (with the
  reason), hello/welcome, pull, push (mutation names, acks, rejects with reason), sign-in, sign-out
  and session expiry: ids, counts and reasons only, never passwords, cookies, tokens, passkey
  material or list text. The CLI commands log errors only. On a deployment: `-e LOG_LEVEL=debug`.
- **Diagnostic log in the web app (T-063):** for connection problems that only show on a user's
  device (stuck "Offline"), the app keeps its own always-on, verbose log in a separate IndexedDB
  database (`lister-diagnostics`, so signing out doesn't wipe it): the newest 5,000 entries and
  nothing older than 7 days, written in batches so it never slows the app. Entries are one line
  each (time, tab id, `*` when the tab leads sync, `area.event`, JSON data) and cover browser
  `online`/`offline`, page lifecycle (visibility, focus, `pagehide`/`pageshow` with `persisted`,
  freeze/resume), the `lister-sync` Web Lock (requested, acquired, released, stolen, stuck steal, probe and its outcome),
  every Socket.IO step (open, `connect`, `connect_error` with message, type and description,
  `disconnect` with its reason, reconnect attempts, close; a failure that repeats while Socket.IO
  retries is logged the first three times and then every 20th, with its count, so hours of
  retrying can't push the moment it started out of the log), an HTTP probe of `/api/auth/me` on
  the first failed attempt and every 20th (`net.probe`: status, or 0 and the error when no answer
  came, and the page's origin, which the handshake's Origin check compares with `PUBLIC_URL`), so
  a refused WebSocket is told apart from an unreachable server, hello, welcome, pull, rows, poke, push,
  ack and reject, every status change of the sync engine **with the reason** (`sync.status`) and
  what this tab shows (`sync.ui-status`: the badge and the status values behind it), REST calls
  (method, path without query, status, duration, network failure, served by the service worker or
  cache when the browser says so), the signed-in user (ids only) and the service worker
  (registration, controller, versions). Socket entries carry the socket id, which the API's debug
  log names too (`Socket <id> connected`, `Hello from <id>`), so the two logs match line by line.
  The same privacy rule as the API's: ids, counts, status codes and reasons only. `Diagnostics`
  scrubs every string (quoted text such as a title in a refusal is replaced, line breaks removed,
  200 characters at most); callers never pass list text, cookies, tokens or passwords. **Settings →
  App** has "Export diagnostic log" (a `.log` file named with the date: a `#` header with build,
  mode, user agent, platform, `onLine`, storage, service worker (with the Angular worker's own
  `/ngsw/state` report: driver state, versions, last update check), server time offset and the
  sync state, then the entries; shared with Web Share on phones, downloaded otherwise; it reads only
  IndexedDB, so it works offline) and "Clear diagnostic log" (with Undo).
- **Backups** with SQLite's online backup (nightly `VACUUM INTO`, after 03:00 UTC, into
  `BACKUP_DIR`, default `backups` beside the database, `/data/backups` in Docker); the last 14 are
  kept (D15). Restoring: `node main.js restore-backup <file>` (refused while another connection,
  i.e. the server, has the database open) migrates a copy of the backup, sets every space's
  `version` and `purged_version` to one above the highest version of any space in the backup or the
  live database (so versions are never reused), gives every space a new `timeline` id, deletes every
  session, then swaps it in (spaces created after the backup are gone). A space's `timeline` names
  the history its versions belong to; a client stores the one its rows came from (`syncState`) and
  sends it with every pull (§4.2), and a pull naming another timeline is always a snapshot. So every
  device replaces its copy, whatever versions it holds or how long it was offline, and a space
  deleted after the backup cannot matter. Sessions go because the
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
  │              └──* Exception ··> Item | List   left out below this edge (D28)
  │
  └──* Run ··> List                where it was started from; none for ad-hoc
         └──* RunItem              copied at start, or added to this run only;
                                   unchecked | checked | skipped, by whom, when
```

Every synced row (lists, items, includes, include exceptions, runs, run items) has: `id` (UUIDv7, generated on the
client so it can be created offline), `space_id`, `version` (see §4.2), `deleted_at` (tombstone),
`created_by`, `updated_by` and timestamps. Accounts, passkeys and sessions stay on the server;
clients only get the display names of the members of their spaces, plus the username and display
name of users who made themselves visible (D27) when they search for someone to add to a space.

| Table                   | Main columns                                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `users`                 | username, display name, password hash, admin flag, must-change-password flag                                                 |
| `passkeys`              | user, credential id, public key, sign counter, transports, name, created at, last used at                                    |
| `sessions`              | user, expiry                                                                                                                 |
| `spaces`, `memberships` | space name, current version; role                                                                                            |
| `lists`                 | title, description, colour and icon (both optional, D26)                                                                     |
| `items`                 | list, title, quantity, note, position                                                                                        |
| `includes`              | parent list, child list, position                                                                                            |
| `include_exceptions`    | include, target kind (`item` \| `list`), target id (D28)                                                                     |
| `runs`                  | source list (none for ad-hoc), title, finished at                                                                            |
| `run_items`             | run, title, quantity, note, position, sources (the lists it came from; the first decides its section), state, changed by, at |
| `processed_mutations`   | mutation id, client id, result (fast path for retries)                                                                       |

**List colour and icon (D26, T-061):** `lists.colour` is one of the 12 names in `LIST_COLOURS` and
`lists.icon` one of the Material Symbols in `LIST_ICONS` (both in `shared/domain`), each `null` when
not set. `list.update` patches them per field (`null` clears one), and the mutation schemas refuse
anything outside the sets; the row schema reads a value it doesn't know as `null`, so a later app
can grow either set without breaking older clients' sync. The web app draws the colour as a light/dark pair of OKLCH tones (about 9:1 and
7:1 contrast) behind the icon. A **run does not copy them**: it keeps only `source_list`, and its
avatar (Runs page, run header) looks the source list up live, like the source link itself, so a
recoloured list recolours its runs, and a run whose list is deleted or was ad-hoc shows none.
`list.duplicate` copies colour and icon with the other fields; `list.create` and "save run as
list" start without. The JSON export carries both (`colour`, `icon`, still format version 1: the
fields are optional, older files import without them, and a value this version doesn't know is
dropped); an older app ignores them.

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
4. Left out (D28) → before the walk, collect the live exceptions of every live include reachable
   from the list whose target is still below that include (others do nothing, §2.2); an item or
   list they name is skipped wherever it is met (leaving out wins). The
   walk reports each skipped entry with the section it would have been in and the list that owns
   the exception, for the editor's "N left out" row.

`flatten()` returns the items (what a run copies); `flattenEntries()` is the same walk with a
section entry for every include (what the editor shows): `live` with its entries, `deleted` for a
list in the trash (the placeholder) or `repeated` for a list already shown above.

**Leaving out (D28):** `include.addException` (client-picked id, include, target kind and id) and
`include.removeException` (include, target). The server checks that the include and the target
exist in the space and that the kind matches; it does not check that the target is below the
include, since offline edits make that a moving target and an exception that does nothing is
harmless. Adding is a no-op while a live exception for the same include and target exists, so a
retry or two clients doing it offline leave one in effect; removing tombstones every live row for
the pair. Undo of a removal adds a new row. Deleting or restoring the include leaves its
exceptions alone. `list.duplicate` copies the exceptions of the copied list's includes (with new
ids); the client sends their new ids in an optional `exceptions` list (`from`, `id`) like items and
includes; targets stay, since they lie in other lists. The JSON export carries them as an optional
`exceptions` field per include (`targetKind`, `targetId`: still format version 1) and gives each
item an optional `id` so they can name it; on import the client maps them to the new ids, drops
those whose target isn't in the file or repeats one, and `list.import` carries them as `exceptions` on the include
entry (rejected if a target isn't in the import or repeats). The Markdown export and print show the flattened view.

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
the run's last item, so every client computes the same positions (an entry may carry its own
`position`, used by "Sort in", D17; it is ignored when the item merges). An item that merges into another keeps its id
as an alias (a removed row with `mergedInto`), so changes made to it elsewhere, e.g. a check made
offline, land on the merged item. Restoring a removed item merges it into an identical item that
entered meanwhile, so a run never shows the same item twice.

**Sorting (D17):** `list.sortItems` and `run.sortItems` set the positions of the listed items in
one step (idempotent: positions are values, so a retry changes nothing). The client computes them
with `sortByTitle()` in `shared/domain`: the sorted items take over the keys the items held (the
"slots"), so includes in the same list keep theirs; rows that shared a key get fresh keys between
their neighbours. Items deleted meanwhile are skipped, an item of another list or run is rejected.
Undo sends the old positions back with the same mutation.

**Import (D24):** a Lister JSON export (`shared/list-transfer`: format `lister-lists`, version 1,
validated by a Zod schema; it holds the exported lists plus every list they include) is imported
by one `list.import` mutation: every list is new (the client picks all ids), each list's items
and includes get positions in the file's order, and an include points at another list of the same
import (includes whose target is missing from the file are dropped by the client). A loop among
the imported lists, a duplicate include or a taken id rejects the whole import, so it is never
half done; a retry is harmless. Markdown and text files are one `list.create` with items (D18).

**Restoring a finished run (D20):** `run.restore` unchecks the item whose state was set last
(`lastCheckedItem()` in `shared/domain`: ties by position, then id) and leaves the run to the same
finishing rule, which reopens it. It does nothing to a run that isn't finished (a retry is
harmless) and is rejected for an unknown run. A finished run is in the trash while `finished_at` is
set and no older than 30 days; there is no `deleted_at` on it and no new column. Who finished it
is derived (`finishedBy()` in `shared/domain`): the change that finished it wrote the run and one
of its items with the same timestamp, so it is the `state_by` of the item whose `state_at` equals
`finished_at`, else the `updated_by` of the item whose `updated_at` equals it (a removal), and only
when later changes to that item hid it, the run's `updated_by`. Not that first: a rename arriving
after the finish would take it over.

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
│   │ write: mutation                   │            │  │   users, spaces, health            │
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
  │ pull {spaceId, since: v, timeline} ─────►│ rows with version > v, or a full snapshot if v predates
  │◄─────────── rows…, version: v2, timeline  │   the purge point or the timeline is not the space's
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
  starts again with hello and a pull. A Socket.IO message over the server's cap also closes the
  connection without a reject, so the cap sits a little above `MAX_PUSH_BYTES` (4 MB of
  mutations): the client packs each push under it (and under 100 mutations) and refuses a single
  change bigger than that before queueing it ("This change is too big to sync"). A pull whose `since` is ahead of the server (restored or
  reset database), or that names another `timeline` than the space's (a restore changed it), gets a
  full snapshot, which replaces the client's copy; the client keeps the timeline of the rows it
  holds (`syncState.timeline`) and sends it back.
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
- **Diagnostic log:** `util-diagnostics` (`Diagnostics`, §2.9) is injected by the sync engine, the
  auth session and the browser-signal collector and, as an HTTP interceptor, sees every REST call.
  Entries wait in memory and a lazily loaded Dexie store writes them in batches (on a timer, and
  at once when the page is hidden, frozen or left), so the shell does not load Dexie for it.
  Other libraries only call `Diagnostics.log(area, event, data)`.
- **Sync engine:** a root service using `socket.io-client`. It exposes signals for `online`,
  `syncing`, `pendingCount`, `lastSyncedAt`, `errors` (refused changes not yet shown) and `errorLog` (the last 20, kept after they were shown), `updateRequired` (starts the service worker update flow via `AppUpdates`) and a `syncNow()` action (any tab can ask; the leader pulls and pushes, or reconnects at once). The Settings page shows them.
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
    list-transfer          export format (Zod), Markdown export, import parsers (D24)   scope:shared type:util
    testing                test-only factories (makeUser, makeList, ...) for specs      scope:shared type:util
  api/
    data-access-db         Drizzle schema, migrations, DB provider                      scope:api type:data-access
    feature-auth           sessions, sign-in, passkeys, user admin, registration tokens, guards scope:api type:feature
    feature-spaces         spaces, memberships                                          scope:api type:feature
    feature-maintenance    nightly backups, daily purge of tombstones and finished runs scope:api type:feature
    feature-sync           gateway, push/pull/poke, MutationService                     scope:api type:feature
  web/
    data-access-local-db   Dexie schema, repositories → signals                         scope:web type:data-access
    data-access-sync       sync engine, outbox, socket, status, SpaceChanges           scope:web type:data-access
    data-access-auth       who is signed in, sign-in/out calls, route guards           scope:web type:data-access
    feature-lists          list library, list editor, composition                       scope:web type:feature
    feature-runs           runs: start, ad-hoc, check/skip, progress, finishing         scope:web type:feature
    feature-auth           sign-in, first-run setup, registration, profile, passkeys scope:web type:feature
    feature-admin          user administration, registration links (admins only) scope:web type:feature
    feature-space          space switcher, spaces and members, Trash                    scope:web type:feature
    feature-transfer       export, import and print of lists and runs (D24)             scope:web type:feature
    feature-settings       Settings: account links, appearance, sync status, app, about, sign out  scope:web type:feature
    feature-search         search field in the app bar: lists, items and runs of the space (D25) scope:web type:feature
    ui                     nav bar/rail, item row, section header, sync status, dialogs scope:web type:ui
    util-pwa               SW updates, install hint, storage persistence, online signal scope:web type:util
    util-diagnostics       on-device diagnostic log, REST interceptor, export (§2.9)    scope:web type:util
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
  bodies keep using class-validator DTOs. The schemas use `zod/mini` (`import * as z from
'zod/mini'`), not classic `zod`: the client validates server messages in its lazily loaded
  sync chunk, and classic Zod alone added ~400 kB to it (T-036). Validation is the same on both
  sides, including Zod's own English messages (`z.config(en())` in `common.ts`; `zod/mini` loads
  none by default, and reject reasons are shown to users). Lint forbids classic `zod` in shared
  code (`sharedPlatformRules`), and an `anyScript` budget in `apps/lister-web/project.json`
  (error at 250 kB per script, bounded by the ~205 kB vendor chunk) is the size backstop.
- Synced data (lists, items, includes, runs, run items) is read from the local database and changed
  through mutations — never through REST CRUD or `httpResource()`. HTTP stays for sign-in,
  passkeys, user administration, spaces, bootstrap and health. Export is built in the browser from
  the local database and import is a mutation (D24), so neither has an endpoint.

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
8. **M8 Editing conveniences (T-048 – T-050):** pasting items into a new list (D18), sorting A–Z
   and sorting new items in (D17), a Settings destination (D19).
9. **M9 Data and finding things (T-059 – T-061):** export, import and printing (D24), search, a
   colour and icon per list.

Sync comes second on purpose: it's the riskiest part, and every later feature is new mutation types
on top of it.

## 8. Deferred

Deliberately not in v1. To pick one up, add a task to `TASKS.md`, and update this document first if
it changes a decision above.

- Run history ("what did we take last time?") — finished runs are only in the trash for 30 days (D10)
- Pulling list changes into an active run
- Presence ("Ben is looking at this list")
- Assigning items to people
- Tags and favourites (search: T-060)
- Open self-registration (admins create accounts or hand out registration links, D23)
- Languages other than English
- Push notifications (not planned)
