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

### T-073 — Make the frozen-leader and trash e2e specs reliable under full-suite load

- Milestone: none (found in the T-072 review, 2026-11-23)
- Area: web
- Priority: normal
- Depends on: —
- Decisions: —
- Done when:
  - `apps/lister-web-e2e/src/frozen-leader.spec.ts` passes reliably in the full e2e run. It failed
    in 2 of 3 full runs during T-072, in a different test each time ("…loads visible while the
    leader is frozen…", "a page the user comes back to takes the sync lock from a frozen page"),
    once with an "Offline" status and once on a missing list link, and passed when run alone.
  - `apps/lister-web-e2e/src/trash.spec.ts` "finished runs in the trash" (phone and desktop) passes
    reliably in the full run; it timed out on `locator.check` now and then but passed 12/12 alone.
  - The cause of each is found and fixed (a race in the test, or a real bug in the app, which then
    gets a fix and a test of its own), not hidden with retries or longer timeouts.
  - Three full `npx nx e2e lister-web-e2e` runs in a row pass with no failures in these specs.
- Notes: Full-run and single-run results are in `tmp/reviews/T-072.md` ("Outside this task"). The
  frozen-leader spec covers T-071's sync-lock probe (`SyncEngine` in `web-data-access-sync`).

## Done

Finished tasks live in [TASKS-done.md](TASKS-done.md), newest first.
