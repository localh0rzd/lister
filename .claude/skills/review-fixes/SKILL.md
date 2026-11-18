---
name: review-fixes
description: Fix the findings of a Lister task review (tmp/reviews/<task-id>.md) and write the fix report — one status per finding (fixed, skipped, disagree), tests, verify, one commit. Use when the review worker fixes its review's findings (substantive first, then trivial), or when a fix is sent back after a re-review.
---

# Fixing review findings

You wrote the review and now fix its findings in two rounds: first the **substantive** ones
(re-reviewed by the coordinator), then the **trivial** ones, nits included (gated by `verify`
only). Each round is its own set, report and commit.

## Steps

1. Read every finding in your set, plus the code each one names: only the lines around it
   (`grep -n`, then `Read` with `offset`/`limit`), not whole files you already reviewed.
2. **Fix each finding**, following `best-practices`, `testing` and `module-boundaries` as for
   the original work. Every bug gets a test that goes red without the fix. Each finding ends in
   exactly one status:
   - `fixed`: how, and which test covers it;
   - `skipped`: real but outside the task — add it to Backlog in `TASKS.md` as a new task
     (`tasks` skill, "Adding tasks") and name its ID; or it needs a product decision — put the
     question under "Questions for the user" in the report;
   - `disagree`: the finding is wrong or contradicts `docs/design.md`, and why.

   When unsure which, ask whoever sent you the findings.

3. **Gate:** run the `verify` skill; commit only once it passes.
4. **Fix report:** one line per finding in your set, each with its status. Every finding
   appears: a missing line counts as not done. Append it to the review as `## Fixes <date>`
   (`## Trivial fixes <date>` for the trivial round).
5. **Commit:**
   - substantive round: `T-NNN: address review`, fix report in the body. `TASKS.md` stays as it
     is apart from new Backlog tasks.
   - trivial round (after the substantive commit, or after the re-review if it sent fixes
     back): close the task first (`tasks` skill, "Closing it"), then commit
     `T-NNN: trivial review fixes`, fix report in the body — even when closing the task is the
     only change.
6. **Finish** with the verdict line from the review, then the commit hash and the report path:

   `Verdict: Changes requested — 1 blocker, 2 major, 0 minor, 1 nit (3 substantive, 1 trivial) — tmp/reviews/T-NNN.md — fixed in abc1234`

## Sent back after a re-review

Fix only what the re-review names, in a new commit with the same message. Update the affected
lines of the fix report under a new `## Fixes <date>` section, then finish as in step 6.
