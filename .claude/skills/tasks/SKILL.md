---
name: tasks
description: Pick up, implement, review and close work items from TASKS.md, the Lister backlog — one commit per task on the work branch, a separate review session after every task, and a pause at the end of each milestone. Use when the user says "next task", "work on T-003", "start implementing", "what's in the backlog", "add a task", or otherwise refers to TASKS.md.
---

# Working the TASKS.md backlog

`TASKS.md` at the repo root is the single backlog. It has three sections: **In progress**,
**Backlog** (ordered by priority) and **Done**. Each task is a `### T-NNN — Title` heading with
bullets (`Milestone`, `Area`, `Priority`, `Depends on`, `Decisions`, `Done when`, `Notes`). The
design behind the tasks is `docs/design.md`.

## Standing agreements with the user (2026-11-12)

- **Branch:** work happens on `work/v1`, cut from `master`. If it doesn't exist yet, run
  `git switch -c work/v1 master`; otherwise `git switch work/v1`. Never push, merge or rebase
  unless the user asks.
- **Commits:** each task gets its own commit, `T-NNN: <title>`, and its review fixes a second
  one, `T-NNN: address review`. That way each review sees exactly one task.
- **Review:** after every task, a **separate review session** reviews it critically (see
  Reviewing it). Don't start the next task until that review is resolved.
- **Pace:** keep going task by task. **Stop at the end of each milestone** (M1, M2, …) with a
  summary. Stop earlier when a decision, a failure you can't fix, or a question needs the user.

## Picking a task

1. Read `TASKS.md`.
2. If the user named an ID, take that task. Otherwise take the **first task in Backlog whose
   `Depends on` tasks are all in Done**.
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
   - Load `best-practices`, `testing` and `module-boundaries` every time.
   - Then load `fullstack-feature` if the task touches more than one area; otherwise
     `angular-feature` or `nest-feature`.
6. Implement, with the tests the `testing` skill requires for every "done when" bullet.
7. Run the `verify` skill. Don't commit while it fails.
8. Commit. Check `git status` for stray files, then commit everything with the message
   `T-NNN: <title>`. The body says what changed; end it with the Co-Authored-By trailer. The task
   stays **In progress** until its review is resolved.

## Reviewing it (after every task)

1. **Start the review session** with `mcp__ccd_session__start_session`. If its schema isn't
   loaded, load it first with ToolSearch (`select:mcp__ccd_session__start_session`). Arguments:
   - `initiation: "user_asked"`. The user asked for a review session after every task.
   - `context: "fresh"` and `use_worktree: false`: it reads this checkout and changes nothing.
   - `name: "review-t-nnn"`, `title: "Review T-NNN: <title>"`, `wake_when_done: true`.
   - Use Opus 5.5 Medium model for the review
   - `prompt`:
     > Review task T-NNN ("<title>") in this repository: the commits `<base>..<head>` on branch
     > `work/v1`. Follow the project's `task-review` skill exactly, including its `ui-review`
     > step when the task changes the web UI. You're read-only: don't edit tracked files,
     > commit, switch branches, stash or install anything; you only write the report
     > `tmp/reviews/T-NNN.md` and its screenshots under `tmp/reviews/T-NNN-ui/`. Don't stop a
     > server you didn't start. End your wrap-up recap and your final message with the
     > verdict line, for example
     > `Verdict: Changes requested — 1 blocker, 2 major, 0 minor, 1 nit — tmp/reviews/T-NNN.md`.
   - `background`:
     > Lister is an Nx monorepo (Angular 22 web app, NestJS 11 API, shared TypeScript
     > libraries) that another Claude session builds one TASKS.md task at a time. The user
     > asked for a critical, independent review after every task. The implementing session is
     > waiting for your report and will fix your findings in a follow-up commit, so precise
     > file and line evidence and concrete failure scenarios matter more than volume.
2. **Wait.** Write a bold title line and one sentence before the call. Afterwards, tell the user
   in one line that the review is running, with a link to the session, and end your turn. Edit
   nothing while it runs, because it reads this checkout. The app continues you when the review
   finishes.
3. **Triage** `tmp/reviews/T-NNN.md`. As soon as the review is over, implement its suggested
   changes; don't wait to be told. The default for every finding, nits included, is to fix
   it. For each finding, choose one:
   - fix it (the default);
   - decline it, only for a good reason (it's wrong, it contradicts `docs/design.md`, or its
     cost clearly outweighs its benefit), with the reason in the fix commit's body;
   - if it's real but outside the task, add it to Backlog as a new task;
   - if you're uncertain whether or how to fix it, ask the user (`AskUserQuestion`) before
     deciding, instead of guessing.
4. **Fix.** Fixes meet the same standard: a test for every bug, then `verify` again.
5. **Re-check.** If there were blockers, send the review session the new range (SendMessage to
   its `local_…` id) and wait for its re-review. Allow at most two rounds, then ask the user.
6. **Close** the task (next section), and commit everything as `T-NNN: address review`, even
   when the only change is closing the task.
7. **Report** to the user: a short summary of every finding you didn't implement (declined or
   deferred), each with why you decided against it, plus any question still open.
8. Continue with the next task, unless the milestone is complete (see End of a milestone).

If the review session can't be started, or it fails, tell the user, and don't start the next
task until they decide how to proceed.

## Closing it

Move the block to the **top of Done** and add these lines under the title:

```
- Completed: YYYY-MM-DD — <one line: what changed, main files/projects>
- Review: <verdict>; <n> fixed, <m> deferred (T-xxx), <k> declined
```

If you stopped short, leave the task in **In progress**, or move it back to Backlog, with a
`- Blocked: <reason / question>` bullet, and tell the user.

If you found follow-up work, add it as a new Backlog task with the next free ID and mention it.
Don't silently expand the current task.

## End of a milestone

When the last task of a milestone is closed, stop and report to the user:

- what was built: each task with one line;
- how to try it: commands and URLs;
- the review outcomes: what was fixed and what was deferred;
- new backlog tasks, and anything that needs their decision.

Offer to merge `work/v1` into `master` or push it. Do neither without a yes.

## Adding tasks for the user

When asked to add a task:

- use the next free ID: the highest existing ID + 1, across all sections;
- follow the format at the top of `TASKS.md`, and place the task in Backlog by priority;
- keep the "done when" bullets user-observable and testable.

Never delete tasks from Done; never renumber IDs.
