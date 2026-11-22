# Issue tracker: TASKS.md

Lister tracks work in [`TASKS.md`](../../TASKS.md) at the repo root, not in GitHub Issues. Finished tasks move to
[`TASKS-done.md`](../../TASKS-done.md), newest first. The `tasks` skill owns the workflow (pick up, implement,
review, close); this file only tells other skills where tickets live and how to write one.

## Conventions

- **A ticket** is a `### T-NNN — <title>` section in `TASKS.md`. Use the next free ID (highest in `TASKS.md` and
  `TASKS-done.md` + 1).
- **Body**: what should be true when it's done, from the user's point of view (bullets are fine), then the fields
  `Milestone:`, `Area:` (web / api / shared / infra), `Priority:` (high / normal / low), `Depends on:` T-xxx,
  `Decisions:` (open decisions from `docs/design.md` it needs), `Notes:`. The header of `TASKS.md` is the
  authoritative format.
- **Sections**: `## In progress` and `## Backlog`, which is ordered by priority (the top unblocked task is "next").
  Put new tickets where their priority belongs.
- **Triage state**: a `Status:` line among the fields, using the strings in `triage-labels.md`. Tasks without one
  count as `ready-for-agent`. A task waiting on a person or a decision also gets the `Blocked:` note `TASKS.md`
  describes.
- **Comments**: append under a `Notes:` bullet in the task; don't start a separate thread.
- **Specs**: a larger spec that would bloat `TASKS.md` goes in `docs/specs/<slug>.md`, and the tasks link to it.

## When a skill says "publish to the issue tracker"

Add T-NNN entries to `TASKS.md` as above. Don't create GitHub issues.

## When a skill says "fetch the relevant ticket"

`grep -n '^### T-NNN' TASKS.md TASKS-done.md` and read that section.

## Wayfinding operations

Used by `/wayfinder`.

- **Map**: `docs/specs/<effort>-map.md` (Notes / Decisions-so-far / Fog).
- **Child ticket**: a T-NNN task in `TASKS.md` with `Notes: part of docs/specs/<effort>-map.md` and a `Type:` line
  (`research` / `prototype` / `grilling` / `task`).
- **Blocking**: the task's `Depends on:` field. A ticket is unblocked when every task it lists is in `TASKS-done.md`.
- **Frontier**: the map's tasks in `## Backlog` that are unblocked; first in backlog order wins.
- **Claim**: move the task to `## In progress` before any work.
- **Resolve**: close it the way the `tasks` skill does (move it to `TASKS-done.md` with a `Completed:` line), then
  add a pointer (gist + T-NNN) to the map's Decisions-so-far.
