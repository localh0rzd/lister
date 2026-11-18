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

## Backlog

### T-068 — Leave out in the list editor

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

## Done

Finished tasks live in [TASKS-done.md](TASKS-done.md), newest first.
