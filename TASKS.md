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

### T-072 — Show the current space in the app bar

- Milestone: none (user request, 2026-11-23)
- Area: web
- Priority: high
- Depends on: —
- Decisions: D29
- Done when:
  - Every signed-in page shows the current space's name: in the top app bar on phones, and at the
    top of the content area (next to the search field where there is one) from 600 px. It shows
    with one space too.
  - The name is a button (with a dropdown icon and an accessible label such as "Space: Family,
    switch space") that opens a menu of the user's spaces, the current one marked; choosing one
    switches the space just like the Space page's switcher, and a last entry opens the Space page.
  - A long space name truncates with an ellipsis (tooltip with the full name) and never pushes the
    search field or sync badge off the bar at 360 px.
  - Renaming the space, being added to or removed from a space, and switching in another tab
    update the name without a reload; offline it still shows from the local database.
  - docs/design.md §2.7 (Layout) mentions the space button in the app bar.
  - Tests: unit tests for the component (name, menu, switching, truncation tooltip); a Playwright
    happy path that sees the space name on Lists, switches space from the app bar and sees the
    other space's lists, at phone and desktop widths, with `expectAccessible`.
- Notes: Reuse the switching logic of `spaces-section.ts` / `CurrentSpace` instead of copying it;
  the component likely belongs in `web-feature-space` and is placed by `apps/lister-web/src/app/app.html`.
  Run the `ui-review` skill.

## Done

Finished tasks live in [TASKS-done.md](TASKS-done.md), newest first.
