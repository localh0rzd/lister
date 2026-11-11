# Lister — Tasks

Backlog for Lister. Add tasks under **Backlog**; Claude picks them up with the `tasks` skill
(e.g. "work on the next task" or "do T-003").

How to write a task:

- Give it the next free ID (`T-001`, `T-002`, …) and a short title.
- Say what should be true when it's done, from the user's point of view. Bullets are fine.
- Optional: `Area:` (web / api / shared / infra), `Priority:` (high / normal / low), `Depends on:` T-xxx, `Notes:`.
- Order the backlog by priority — the top unblocked task is "next".

Statuses: tasks move **Backlog → In progress → Done**. Claude moves them and adds a one-line
summary when it finishes. Anything blocked or needing a decision goes back with a `Blocked:` note.

---

## In progress

_Nothing in progress._

## Backlog

### T-001 — Example: show all lists on the home page

- Area: web, api, shared
- Priority: normal
- Done when:
  - `GET /api/lists` returns the user's lists (in-memory store is fine for now)
  - The home page shows the lists, with an empty state when there are none
- Notes: This is an example task — edit or delete it.

## Done

_Nothing done yet._
