---
name: tasks
description: Pick up, implement, review and close work items from TASKS.md, the Lister backlog — the main session coordinates, a task worker session implements each task and a review worker session reviews it, and a pause at the end of each milestone. Use when the user says "next task", "work on T-003", "start implementing", "what's in the backlog", "add a task", or otherwise refers to TASKS.md.
---

# Working the TASKS.md backlog

`TASKS.md` at the repo root is the single backlog. It has three sections: **In progress**,
**Backlog** (ordered by priority) and **Done**. Each task is a `### T-NNN — Title` heading with
bullets (`Milestone`, `Area`, `Priority`, `Depends on`, `Decisions`, `Done when`, `Notes`). The
design behind the tasks is `docs/design.md`.

## Roles (agreed with the user, 2026-11-12)

The main session is the **coordinator**. It runs at **medium** effort, and it doesn't write task
code itself. For every task, it starts three sessions with `mcp__ccd_session__start_session`
(`initiation: "user_asked"`, `context: "fresh"`, `use_worktree: false`, `wake_when_done: true`,
with the model and effort given below), one after the other:

1. **Task worker**, `model: "claude-sonnet-5-5"`, `effort: "medium"`, `name: "task-t-nnn"`: picks up the task and implements it
   following "Doing it" below, through to the verified `T-NNN: <title>` commit. It doesn't start
   the review. Its brief names the task, the base commit, and these skills: this one,
   `best-practices`, `testing`, `module-boundaries` and `verify`.
2. **Simplifier**, `model: "claude-sonnet-5-5"`, `effort: "medium"`, `name: "simplify-t-nnn"`
   (added at the user's request, 2026-11-16): starts once the task commit exists and follows
   "Simplifying it" below. It only cleans up the task's own code, without changing behaviour, and
   commits `T-NNN: simplify`.
3. **Review worker**, `model: "claude-opus-5-5"`, `effort: "medium"`, `name: "review-t-nnn"`: starts once the
   simplifier is done, reviews the whole range (task commit plus simplify commit) and follows
   "Reviewing it" below. It writes the report with each finding marked
   **trivial** or **substantive** (`task-review` skill), then fixes the substantive ones
   itself.

The review loop (agreed with the user, 2026-11-12):

1. **Substantive findings: the review worker fixes them** (`review-fixes`) and commits
   `T-NNN: address review`.
2. **The coordinator re-reviews only that fix diff** (`fix-re-review`). The review worker graded
   its own work, so this check and the test gate both stay. Two rounds at most, then ask the
   user.
3. **Trivial findings: the task worker fixes them** (`review-fixes`), with no re-review;
   `verify` is the gate. It closes the task and commits `T-NNN: trivial review fixes`.
4. Every fixer writes a fix report with one status per finding; the coordinator treats a
   missing finding as not done.
5. The coordinator reports to the user (see Reviewing it, step 6), then goes on to the next
   task, stopping at the end of each milestone.

If there are no substantive findings, skip steps 1–2. If there are no trivial ones, the task
worker only closes the task.

The coordinator's own effort caps the effort of the sessions it starts. After each start, check
model and effort with `mcp__ccd_session_mgmt__get_session`, and if either is wrong, fix it with
`mcp__ccd_session_mgmt__set_session_model` / `mcp__ccd_session_mgmt__set_session_effort`.

## Standing agreements with the user (2026-11-12)

- **Branch:** work happens on `work/v1`, cut from `master`. If it doesn't exist yet, run
  `git switch -c work/v1 master`; otherwise `git switch work/v1`. Never push, merge or rebase
  unless the user asks.
- **Commits:** each task gets its own commit, `T-NNN: <title>`, followed by the simplifier's
  `T-NNN: simplify` (none when it finds nothing worth changing). Its substantive review fixes
  get a second one, `T-NNN: address review` (by the review worker), and its trivial fixes and
  the closing of the task a third, `T-NNN: trivial review fixes` (by the task worker). That way
  each review sees exactly one task, and each re-review exactly one fix diff.
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

## Simplifying it (after the task commit, before the review)

1. **Start the simplifier session** with `mcp__ccd_session__start_session`: `initiation:
"user_asked"`, `context: "fresh"`, `use_worktree: false`, `wake_when_done: true`,
   `name: "simplify-t-nnn"`, `title: "Simplify T-NNN: <title>"`, `model: "claude-sonnet-5-5"`,
   `effort: "medium"`; check model and effort with `get_session` afterwards.
   - `prompt`:
     > Simplify the code of task T-NNN ("<title>") in this repository: the commit(s)
     > `<base>..<head>` on branch `work/v1`. Run the `simplify` skill on exactly that diff, and
     > follow `best-practices` and `module-boundaries`. Only reuse, simplification, efficiency and
     > clarity cleanups of code this task added or changed: behaviour, public APIs, tests' intent,
     > `TASKS.md` and `docs/design.md` stay as they are, and nothing outside the task's diff
     > changes. Don't look for bugs; if you notice one, list it in your final message instead
     > of fixing it. Run `verify`. If anything changed, commit it as `T-NNN: simplify`, with a
     > body listing each change and why, and the trailer
     > `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; if nothing was worth
     > changing, commit nothing and say so. Don't switch branches, stash or install anything.
     > End your final message with the commit hash, or "no changes".
   - `background`: the same project summary as the review's, saying that a task worker
     implemented the task, a review worker reviews it after you, and the coordinator checks your
     diff.
2. **Wait** (one line to the user with a link to the session, then end your turn).
3. **Check** the simplify diff quickly: behaviour-preserving, inside the task's diff, `verify`
   green. If a change alters behaviour or goes beyond the task, send it back (SendMessage) or
   revert that part. Pass any bugs it listed to the review as notes in its prompt.

## Reviewing it (after every task)

1. **Start the review session** with `mcp__ccd_session__start_session`. If its schema isn't
   loaded, load it first with ToolSearch (`select:mcp__ccd_session__start_session`). Arguments:
   - `initiation: "user_asked"`. The user asked for a review session after every task.
   - `context: "fresh"` and `use_worktree: false`: it reads this checkout and changes nothing.
   - `name: "review-t-nnn"`, `title: "Review T-NNN: <title>"`, `wake_when_done: true`.
   - `model: "claude-opus-5-5"`, `effort: "medium"`. Then check the effort with `get_session`,
     since it's capped at the coordinator's own (see Roles).
   - `<head>` is the last commit of the task, its `T-NNN: simplify` commit if there is one.
   - `prompt`:
     > Review task T-NNN ("<title>") in this repository: the commits `<base>..<head>` on branch
     > `work/v1`. Follow the project's `task-review` skill exactly, including its `ui-review`
     > step when the task changes the web UI. Mark every finding trivial or substantive. Stay
     > read-only until the report `tmp/reviews/T-NNN.md` (screenshots under
     > `tmp/reviews/T-NNN-ui/`) is written. Then fix the substantive findings yourself with
     > the `review-fixes` skill (one commit `T-NNN: address review`, a fix report with one
     > status per finding). Leave the trivial findings to the task worker. Don't switch branches,
     > stash or install anything, and don't stop a server you didn't start. End your wrap-up
     > recap and your final message with the verdict line plus the fix commit, for example
     > `Verdict: Changes requested — 1 blocker, 2 major, 0 minor, 1 nit (3 substantive, 1 trivial) — tmp/reviews/T-NNN.md — fixed in abc1234`.
   - `background`:
     > Lister is an Nx monorepo (Angular 22 web app, NestJS 11 API, shared TypeScript
     > libraries) that another Claude session builds one TASKS.md task at a time. The user
     > asked for a critical, independent review after every task. You fix the substantive
     > findings yourself; a task worker (Sonnet) fixes the trivial ones from your report
     > alone, so each trivial finding must say exactly what to change. The coordinator
     > re-reviews your fix diff. Precise file and line evidence and concrete failure scenarios
     > matter more than volume.
2. **Wait.** Write a bold title line and one sentence before the call. Afterwards, tell the user
   in one line that the review is running, with a link to the session, and end your turn. Edit
   nothing while it runs, because it reads this checkout. The app continues you when the review
   finishes.
3. **Check the substantive fixes** with the `fix-re-review` skill.
4. **Hand the trivial findings to the task worker** (SendMessage to its `local_…` id): the
   report path, the trivial finding numbers, and "follow the `review-fixes` skill". It fixes
   them all, nits included, and closes the task. When it asks you and you can't decide, ask the
   user (`AskUserQuestion`).
5. **Check** its fix report for completeness; `verify` is the gate, with no re-review.
6. **Report** to the user: a short summary of every finding that wasn't fixed (skipped or
   disagree, in either fix report), each with its reason, plus any question still open.
7. Continue with the next task, unless the milestone is complete (see End of a milestone).

If the review session can't be started, or it fails, tell the user, and don't start the next
task until they decide how to proceed.

## Closing it

Move the block to the **top of Done** and add these lines under the title:

```
- Completed: YYYY-MM-DD — <one line: what changed, main files/projects>
- Review: <verdict>; <n> fixed (<s> substantive, <t> trivial), <m> skipped (T-xxx), <k> disagreed; re-review rounds: <r>
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
