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

### T-065 — Shared test factories for users, spaces and synced rows

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

## Backlog

## Done

Finished tasks live in [TASKS-done.md](TASKS-done.md), newest first.
