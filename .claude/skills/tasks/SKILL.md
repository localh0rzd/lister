---
name: tasks
description: Pick up, implement and close work items from TASKS.md, the Lister backlog. Use when the user says "next task", "work on T-003", "what's in the backlog", "add a task", or otherwise refers to TASKS.md.
---

# Working the TASKS.md backlog

`TASKS.md` at the repo root is the single backlog. Sections: **In progress**, **Backlog** (ordered by priority), **Done**. Each task is a `### T-NNN — Title` heading with bullets (`Milestone`, `Area`, `Priority`, `Depends on`, `Decisions`, `Done when`, `Notes`). The design behind the tasks is `docs/design.md`.

## Picking a task

1. Read `TASKS.md`.
2. If the user named an ID, take that one. Otherwise take the **first task in Backlog whose `Depends on` tasks are all in Done**.
3. If anything is already **In progress**, ask whether to continue it before starting another.
4. If the task is ambiguous (unclear "done when", conflicting with existing code, or needs a product decision), ask the user before writing code. Don't guess at product behaviour.

## Doing it

1. Read the parts of `docs/design.md` the task touches. If the task and the design disagree, ask before writing code.
2. If the task lists `Decisions:`, look them up under **Open decisions** in `docs/design.md`. For any still _open_, ask the user once and propose the default. Record each answer in the doc's Decisions table and remove it from Open decisions. If the answer differs from the default, also update whatever in `CLAUDE.md`, the skills and `TASKS.md` assumed the default.
3. Move the task block to **In progress** (cut and paste the whole block; keep the ID).
4. Restate the "done when" criteria as your plan. If the task touches more than one area, follow the `fullstack-feature` skill; otherwise `angular-feature` or `nest-feature`.
5. Implement, with tests for each "done when" bullet.
6. Run the `verify` skill. Don't close a task while verify fails.

## Closing it

Move the block to the **top of Done** and add, under the title:

```
- Completed: YYYY-MM-DD — <one line: what changed, main files/projects>
```

If you stopped short, leave it in **In progress** (or move it back to Backlog) with a `- Blocked: <reason / question>` bullet, and tell the user.

If you discovered follow-up work, add it as a new Backlog task with the next free ID and mention it — don't silently expand the current task.

## Adding tasks for the user

When asked to add a task: use the next free ID (highest existing ID + 1, across all sections), follow the format at the top of `TASKS.md`, place it in Backlog by priority, and keep the "done when" bullets user-observable and testable.

Never delete tasks from Done; never renumber IDs.
