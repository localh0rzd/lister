# Coordinating tasks (main session only)

## Roles (agreed with the user, 2026-11-12)

The main session is the **coordinator**. It runs at **medium** effort, and it doesn't write task
code itself. For every task, it starts two sessions with `mcp__ccd_session__start_session`
(`initiation: "user_asked"`, `context: "fresh"`, `use_worktree: false`, `wake_when_done: true`,
with the model and effort given below), one after the other. Every session starts with about
45k tokens of fixed context, so don't start more than these two per task (the user asked for
this, 2026-11-17).

1. **Task worker**, `model: "claude-sonnet-5-5"`, `effort: "medium"`, `name: "task-t-nnn"`: picks up the task and implements it
   following "Doing it" below, through to the verified `T-NNN: <title>` commit, then simplifies
   its own diff (step 9, the `T-NNN: simplify` commit; added 2026-11-16, moved into the task
   worker 2026-11-17). It doesn't start the review, and its session ends there (2026-11-18:
   long sessions resend their whole context on every call). Its brief names the task, the base
   commit, and these skills: this one, `best-practices`, `testing`, `module-boundaries`,
   `simplify` and `verify`.
2. **Review worker**, `model: "claude-opus-5-5"`, `effort: "medium"`, `name: "review-t-nnn"`: starts once the
   task worker is done, reviews the whole range (task commit plus simplify commit) and follows
   "Reviewing it" below. It writes the report with each finding marked
   **trivial** or **substantive** (`task-review` skill), then fixes all of them itself: the
   substantive ones first, then the trivial ones, and closes the task.

### Keeping worker sessions small (2026-11-18, from the T-064 worker's own analysis)

T-064's single full-stack worker reached 120k tokens (75% of the window) before it committed.
So:

- **Split full-stack tasks into two task workers**, one after the other: `task-t-nnn-api`
  (shared contracts, migration, API, API tests; commit `T-NNN: <title> (API)`) and then
  `task-t-nnn-web` (web, unit tests, Playwright; commit `T-NNN: <title> (web)`). Each simplifies
  and verifies only its own diff and ends. The API worker moves the task to In progress; the
  web worker's brief names the API commit and the contract types it should use. One review
  worker still reviews the whole range. Single-area tasks keep one worker.
- **Pre-decide in the brief** what you already know, so the worker doesn't discover it by
  failing builds: which library each piece goes in, the existing files to change (paths), the
  validation approach (REST: class-validator DTOs, `api-contracts` types only, no Zod), test
  helpers to reuse, and any `TASKS.md` wording that the skills override.
- **Every brief ends with**: "Keep context small (CLAUDE.md): filter all Nx, Vitest and
  Playwright output; typecheck touched projects first; run full `affected` and e2e once, in the
  background with Monitor; grep, then read ~60 lines."
- Workers don't need the browser, Chrome, scheduled-task, sidebar or window tools; those are
  denied in `.claude/settings.local.json`, so they aren't in any session's tool list.

The review loop (agreed with the user, 2026-11-12):

1. **Substantive findings: the review worker fixes them** (`review-fixes`) and commits
   `T-NNN: address review`.
2. **The coordinator re-reviews only that fix diff** (`fix-re-review`). The review worker graded
   its own work, so this check and the test gate both stay. Two rounds at most, then ask the
   user.
3. **Trivial findings: the review worker fixes them too** (`review-fixes`), after the
   substantive ones, with no re-review; `verify` is the gate. It closes the task and commits
   `T-NNN: trivial review fixes` (moved from the task worker 2026-11-18, so the task worker's
   session can end after its simplify commit).
4. Every fixer writes a fix report with one status per finding; the coordinator treats a
   missing finding as not done.
5. The coordinator reports to the user (see Reviewing it, step 6), then goes on to the next
   task, stopping at the end of each milestone.

If there are no substantive findings, skip steps 1–2. If there are no trivial ones, the review
worker only closes the task (in its last commit, or a commit of its own).

The coordinator's own effort caps the effort of the sessions it starts. After each start, check
model and effort with `mcp__ccd_session_mgmt__get_session`, and if either is wrong, fix it with
`mcp__ccd_session_mgmt__set_session_model` / `mcp__ccd_session_mgmt__set_session_effort`.

## Coordinator context budget (2026-11-18)

The coordinator runs for many tasks, and every call resends its whole context. Keep it small:

- Don't read source files, full diffs or full logs. Use the workers' reports,
  `git log --oneline -5`, `git show --stat <commit>` and `git diff --stat`.
- From a review report, read only the verdict and finding headings
  (`grep -n '^###\|^Verdict' tmp/reviews/T-NNN.md`); open a finding's body only when
  re-reviewing it.
- `get_session` only to check model and effort after a start, not to follow progress.
- Don't run reviews, browsers or security audits yourself; that's what the workers are for.
- After each closed task, ask the user to `/compact` this session.

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
     > status per finding), then the trivial findings the same way (commit
     > `T-NNN: trivial review fixes`, which also closes the task in TASKS.md). Don't switch branches,
     > stash or install anything, and don't stop a server you didn't start. Keep context small
     > (CLAUDE.md): filter all Nx, Vitest and Playwright output, run the full e2e suites once in the
     > background, and read diffs per file with `git diff --stat` first. End your wrap-up
     > recap and your final message with the verdict line plus the fix commit, for example
     > `Verdict: Changes requested — 1 blocker, 2 major, 0 minor, 1 nit (3 substantive, 1 trivial) — tmp/reviews/T-NNN.md — fixed in abc1234`.
   - `background`:
     > Lister is an Nx monorepo (Angular 22 web app, NestJS 11 API, shared TypeScript
     > libraries) that another Claude session builds one TASKS.md task at a time. The user
     > asked for a critical, independent review after every task. You fix all findings
     > yourself, substantive ones first. The coordinator re-reviews your substantive fix diff;
     > trivial fixes are gated by `verify` only. Precise file and line evidence and concrete failure scenarios
     > matter more than volume.
2. **Wait.** Write a bold title line and one sentence before the call. Afterwards, tell the user
   in one line that the review is running, with a link to the session, and end your turn. Edit
   nothing while it runs, because it reads this checkout. The app continues you when the review
   finishes.
3. **Check the substantive fixes** with the `fix-re-review` skill.
4. **Trivial findings:** the review worker fixes them after its substantive fixes (all of them,
   nits included) and closes the task. If the re-review sent substantive fixes back, it does
   the trivial ones after that round. When it asks you and you can't decide, ask the user
   (`AskUserQuestion`).
5. **Check** its trivial fix report for completeness; `verify` is the gate, with no re-review.
6. **Report** to the user: a short summary of every finding that wasn't fixed (skipped or
   disagree, in either fix report), each with its reason, plus any question still open.
7. Continue with the next task, unless the milestone is complete (see End of a milestone).

If the review session can't be started, or it fails, tell the user, and don't start the next
task until they decide how to proceed.

## End of a milestone

When the last task of a milestone is closed, stop and report to the user:

- what was built: each task with one line;
- how to try it: commands and URLs;
- the review outcomes: what was fixed and what was deferred;
- new backlog tasks, and anything that needs their decision.

Offer to merge `work/v1` into `master` or push it. Do neither without a yes.
