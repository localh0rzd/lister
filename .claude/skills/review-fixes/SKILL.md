---
name: review-fixes
description: Fix the findings of a Lister task review (tmp/reviews/<task-id>.md) and write the fix report — one status per finding (fixed, skipped, disagree), tests, verify, one commit. Use when you're told to fix a review's substantive findings (review worker) or trivial findings (task worker), or when a fix is sent back after a re-review.
---

# Fixing review findings

You're given a review report and a set of findings to fix: the **substantive** ones if you
wrote the review, the **trivial** ones (nits included) if you're the task worker. Fix exactly
that set; the other tier belongs to the other fixer.

## Steps

1. Read the report and every finding in your set, plus the code each one names.
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
   (`## Trivial fixes <date>` for the task worker).
5. **Commit:**
   - review worker: `T-NNN: address review`, fix report in the body. `TASKS.md` stays as it is
     apart from new Backlog tasks.
   - task worker: close the task first (`tasks` skill, "Closing it"), then commit
     `T-NNN: trivial review fixes`, fix report in the body — even when closing the task is the
     only change.
6. **Finish** with the verdict line from the review, then the commit hash and the report path:

   `Verdict: Changes requested — 1 blocker, 2 major, 0 minor, 1 nit (3 substantive, 1 trivial) — tmp/reviews/T-NNN.md — fixed in abc1234`

## Sent back after a re-review

Fix only what the re-review names, in a new commit with the same message. Update the affected
lines of the fix report under a new `## Fixes <date>` section, then finish as in step 6.
