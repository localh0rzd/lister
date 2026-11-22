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

### T-071 — A visible page takes the sync lock from a holder that doesn't answer

- Milestone: none (field bug, 2026-11-22)
- Area: web
- Priority: high
- Depends on: T-070
- Decisions: —
- Done when:
  - A visible page waiting for the `lister-sync` lock checks whether the holder is alive: it sends
    a ping on a `BroadcastChannel` (e.g. `lister-sync-leader`) and the leading page answers at once.
    No answer within ~2 s means the holder is frozen or gone, and the page takes the lock with
    `steal`. This covers a page that loads or reloads already visible, "Sync now" pressed while
    waiting, and coming to the front (it can replace or back up the T-070 transition steals).
  - Live pages never steal from each other: a leader that answers keeps the lock, so two visible
    desktop windows don't trade it back and forth. A hidden page never probes.
  - Probing stops once the page leads, and only repeats on events (load, visible, resume,
    Sync now), not on a timer while hidden.
  - The diagnostic log records the probe and its outcome (e.g. `lock.probe`, `lock.probe-answered`,
    `lock.probe-steal`).
  - docs/design.md "Several tabs" (§ around line 295) describes the probe and drops the "only on
    the transition" wording.
  - Tests: unit tests in `data-access-sync` for steal when the probe gets no answer (on start
    visible, on Sync now, on visible), no steal when the leader answers, no probe while hidden or
    leading, and the stepped-back old leader; extend `frozen-leader.spec.ts` so a page that
    _loads_ visible while the leader is frozen goes online.
- Notes: Seen on the phone (Brave, Android) on 2026-11-22 with the T-070 build live: the visible
  tab had reloaded (log `app.start` with `navigation: reload`, `visibility: visible`) and waited
  behind a frozen Lister tab holding the lock, with no `lock.visible-steal` logged, because T-070
  only steals on a change to visible. A frozen page runs no handlers, so it can't answer the
  ping; that silence is the signal. Keep the `steal` and `stolen` paths from T-070
  (`SyncEngine` in `packages/web/data-access-sync/src/lib/sync-engine.ts`).

## Backlog

## Done

Finished tasks live in [TASKS-done.md](TASKS-done.md), newest first.
