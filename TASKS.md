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

### T-066 — Test factory for local space rows

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

## Backlog

## Done

Finished tasks live in [TASKS-done.md](TASKS-done.md), newest first.
