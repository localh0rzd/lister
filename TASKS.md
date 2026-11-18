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
**M5** Accounts and spaces · **M6** Collaboration polish · **M7** Deployment · **M8** Editing conveniences · **M9** Data and finding things · **M10** Leaving out

---

## In progress

### T-069 — Keep exceptions when duplicating, exporting and importing

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

## Backlog

## Done

Finished tasks live in [TASKS-done.md](TASKS-done.md), newest first.
