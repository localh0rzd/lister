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

### T-070 — A frozen page holding the sync lock no longer blocks sync

- Milestone: none (field bug, 2026-11-22)
- Area: web
- Priority: high
- Depends on: —
- Decisions: —
- Done when:
  - With two Lister pages open (e.g. the installed PWA and a browser tab), the page the user is
    looking at syncs, even when the other page took the `lister-sync` lock and was then frozen or
    discarded in the background (Android does this): a page that becomes visible or resumes while
    still waiting for the lock takes it with `steal`. The old leader, when it thaws, finds its lock
    stolen, steps back and waits again (the existing "stolen" path).
  - Two pages that are both visible (desktop windows side by side) don't keep stealing the lock
    from each other: a steal happens only on the transition to visible/resume, never on a timer.
  - The diagnostic log records the steal with its reason (e.g. `lock.visible-steal`).
  - docs/design.md "Several tabs" (§ around line 295) describes the new rule.
  - Tests: unit tests in `data-access-sync` for steal-on-visible, steal-on-resume, no steal while
    leading or when already holding the lock, and the stepped-back old leader; a Playwright check
    with two pages where the leading page is frozen (CDP `Page.setWebLifecycleState`) and the
    other, brought to the front, goes online.
- Notes: Seen on the phone (Brave, Android) on 2026-11-22: the visible PWA showed Offline with
  `navigator.locks.query()` reporting the lock held plus one pending request, while the holding
  tab did not respond (frozen). `checkStuck` in
  `packages/web/data-access-sync/src/lib/sync-engine.ts` only steals when nobody holds the lock,
  so it never fires here. Optionally also release the lock on `freeze`, but don't rely on it:
  frozen or discarded pages can't be trusted to run handlers.

## Backlog

## Done

Finished tasks live in [TASKS-done.md](TASKS-done.md), newest first.
