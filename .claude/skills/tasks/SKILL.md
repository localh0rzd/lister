---
name: tasks
description: Pick up, implement, review and close work items from TASKS.md, the Lister backlog — the main session coordinates, a task worker session implements each task and a review worker session reviews it, and a pause at the end of each milestone. Use when the user says "next task", "work on T-003", "start implementing", "what's in the backlog", "add a task", or otherwise refers to TASKS.md.
---

# Working the TASKS.md backlog

`TASKS.md` at the repo root is the single backlog. It has three sections: **In progress**,
**Backlog** (ordered by priority) and **Done**, whose tasks live in `TASKS-done.md` (newest
first) so `TASKS.md` stays short. Each task is a `### T-NNN — Title` heading with
bullets (`Milestone`, `Area`, `Priority`, `Depends on`, `Decisions`, `Done when`, `Notes`). The
design behind the tasks is `docs/design.md`.

## Who does what

The main session is the **coordinator**: it doesn't write task code, it starts a **task worker**
session (implements, verifies, commits, simplifies, then ends) and a **review worker** session
(reviews, fixes all findings, closes the task) per task. **Coordinator: also read
[coordinator.md](coordinator.md)** — roles, models, the review loop, review prompts, your
context budget and milestone stops. Workers don't need it.

## Standing agreements with the user (2026-11-12)

- **Branch:** work happens on `work/v1`, cut from `master`. If it doesn't exist yet, run
  `git switch -c work/v1 master`; otherwise `git switch work/v1`. Never push, merge or rebase
  unless the user asks.
- **Commits:** each task gets its own commit, `T-NNN: <title>`, followed by the task worker's
  `T-NNN: simplify` (none when it finds nothing worth changing). Its substantive review fixes
  get a second one, `T-NNN: address review`, and its trivial fixes and the closing of the task
  a third, `T-NNN: trivial review fixes` (both by the review worker). That way
  each review sees exactly one task, and each re-review exactly one fix diff.
- **Review:** after every task, a **separate review session** reviews it critically (see
  coordinator.md). Don't start the next task until that review is resolved.
- **Pace:** keep going task by task. **Stop at the end of each milestone** (M1, M2, …) with a
  summary. Stop earlier when a decision, a failure you can't fix, or a question needs the user.

## Picking a task

1. Find the task in `TASKS.md` with `grep -n '^## \|^### ' TASKS.md`, then read only the
   sections you need (`Read` with `offset`/`limit`). Finished tasks are in `TASKS-done.md`.
2. If the user named an ID, take that task. Otherwise take the **first task in Backlog whose
   `Depends on` tasks are all done** (`grep -n '^### T-0xx' TASKS-done.md`).
3. If something is already **In progress**, finish it (including its review) before starting
   another, unless the user says otherwise.
4. If the task is ambiguous (an unclear "done when", a conflict with existing code, or a product
   decision it needs), ask the user before writing code. Don't guess at product behaviour.

## Doing it

1. Read the parts of `docs/design.md` the task touches. If the task and the design disagree,
   ask before writing code.
2. If the task lists `Decisions:`, look them up under **Open decisions** in `docs/design.md`.
   - For any that are still _open_, ask the user once and propose the default.
   - Record each answer in the doc's Decisions table and remove it from Open decisions.
   - If an answer differs from the default, also update whatever in `CLAUDE.md`, the skills and
     `TASKS.md` assumed the default.
3. Make sure you're on `work/v1` with a clean working tree. Note the current commit: it's the
   review's `<base>`.
4. Move the task block to **In progress**: cut and paste the whole block and keep its ID.
5. Plan:
   - Restate the "done when" criteria as your plan.
   - Load `best-practices` and `testing`, and the area skill: `fullstack-feature` if the task
     touches more than one area, otherwise `angular-feature` or `nest-feature`.
   - Load `module-boundaries` when you create a library, move code between projects or add
     an import from another project (lint enforces the rest).
6. Implement, with the tests the `testing` skill requires for every "done when" bullet.
7. Run the `verify` skill. Don't commit while it fails.
8. Commit. Check `git status` for stray files, then commit everything with the message
   `T-NNN: <title>`. The body says what changed; end it with the Co-Authored-By trailer. The task
   stays **In progress** until its review is resolved.
9. Simplify (see "Simplifying it" below), then end with both commit hashes (or "no changes" for
   the simplify step) and any bugs you noticed while simplifying. Your session ends here: the
   review worker fixes the review's findings and closes the task.

## Simplifying it (task worker, after the task commit, before the review)

1. Run the `simplify` skill on exactly the task's diff (`<base>..HEAD`), following
   `best-practices` and `module-boundaries`. Do it inline: don't start review agents or sessions
   for it.
2. Only reuse, simplification, efficiency and clarity cleanups of code this task added or
   changed: behaviour, public APIs, tests' intent, `TASKS.md` and `docs/design.md` stay as they
   are, and nothing outside the task's diff changes. Don't look for bugs here; list any you
   notice in your final message instead of fixing them.
3. Run `verify`. If anything changed, commit it as `T-NNN: simplify`, with a body listing each
   change and why; if nothing was worth changing, commit nothing and say so.
4. **Coordinator:** check the simplify diff quickly (behaviour-preserving, inside the task's
   diff, `verify` green). If a change alters behaviour or goes beyond the task, send it back
   (SendMessage) or revert that part. Pass any bugs the worker listed to the review as notes in
   its prompt.

## Closing it

Move the block from `TASKS.md` to the **top of `TASKS-done.md`** (under its intro) and add these lines under the title:

```
- Completed: YYYY-MM-DD — <one line: what changed, main files/projects>
- Review: <verdict>; <n> fixed (<s> substantive, <t> trivial), <m> skipped (T-xxx), <k> disagreed; re-review rounds: <r>
```

If you stopped short, leave the task in **In progress**, or move it back to Backlog, with a
`- Blocked: <reason / question>` bullet, and tell the user.

If you found follow-up work, add it as a new Backlog task with the next free ID and mention it.
Don't silently expand the current task.

## Adding tasks for the user

When asked to add a task:

- use the next free ID: the highest existing ID + 1, across all sections;
- follow the format at the top of `TASKS.md`, and place the task in Backlog by priority;
- keep the "done when" bullets user-observable and testable.

Never delete tasks from `TASKS-done.md`; never renumber IDs.
