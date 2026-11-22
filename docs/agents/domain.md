# Domain docs

How the engineering skills should consume Lister's domain documentation. Layout: **single-context**, with
`docs/design.md` as the source of truth.

## Before exploring, read these

- **`docs/design.md`**: it's long, so find sections with `grep -n '^#' docs/design.md` and read only the relevant
  ones. In particular:
  - **Glossary** (under "Decisions"): the domain vocabulary (list, item, include, run, space, …).
  - **Decisions** table (D1, D2, …): the project's ADRs. Cite them by ID.
  - **Open decisions**: questions not yet answered. Don't decide them silently.
  - **§3 Domain model** and **§4 Architecture** for entities, sync and the server/web split.
- **`CONTEXT.md`** and **`docs/adr/`** at the repo root, if they exist: supplements only. If one contradicts
  `docs/design.md`, the design doc wins; flag the mismatch.

If `CONTEXT.md` or `docs/adr/` don't exist, **proceed silently**. Don't suggest creating them.

## Recording terms and decisions

`/domain-modeling` (and `/grill-with-docs`, `/improve-codebase-architecture`) record into `docs/design.md`, not new
files: new terms go in its Glossary, resolved decisions get the next free D-number in its Decisions table, and the
section the decision belongs to is updated. Per `CLAUDE.md`, a change that departs from the design doc updates it in
the same change, and the user is told.

## Use the glossary's vocabulary

When your output names a domain concept (in a task title, refactor proposal, hypothesis or test name), use the term
as the Glossary defines it — e.g. "run", not "checklist instance"; "include", not "sublist". If the concept you need
isn't in the Glossary, either you're inventing language the project doesn't use (reconsider) or there's a real gap
(note it for `/domain-modeling`).

## Flag decision conflicts

If your output contradicts a decision, say so explicitly rather than silently overriding:

> _Contradicts D2 (includes are live references), but worth reopening because…_
