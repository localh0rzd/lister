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

Statuses: tasks move **Backlog → In progress → Done** (`TASKS-done.md`). Claude moves them, commits each task on
`work/v1`, has a separate session review it, and closes it with a one-line summary once the
review is resolved. Anything blocked or needing a decision goes back with a `Blocked:` note.

Milestones: **M1** Foundations · **M2** Sync walking skeleton · **M3** Composition · **M4** Runs ·
**M5** Accounts and spaces · **M6** Collaboration polish · **M7** Deployment · **M8** Editing conveniences · **M9** Data and finding things

---

## In progress

### T-064 — Suggest users when adding a member to a space

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

## Backlog

## Done

Finished tasks live in [TASKS-done.md](TASKS-done.md), newest first.
