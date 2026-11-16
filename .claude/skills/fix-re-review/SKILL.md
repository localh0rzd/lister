---
name: fix-re-review
description: Re-review one fix commit from a Lister task review — do these changes correctly address findings X, Y, Z without regressions? — and record the outcome in tmp/reviews/<task-id>.md. Use when the coordinator checks a review worker's `T-NNN: address review` commit, or when asked to re-check review fixes.
---

# Re-reviewing a fix diff

The question is narrow: **do these changes correctly address findings X, Y, Z, without
regressions?** Scope is the fix commit's diff only; the task as a whole was already reviewed.

1. Read the fix report (in the commit body and the review's `## Fixes` section) and the diff
   (`git diff <fix>^..<fix>`), plus the code the diff touches.
2. **Completeness:** every substantive finding of the review has a line in the fix report. A
   missing one counts as not done.
3. **Each status holds:** `fixed` really fixes the scenario and its named test goes red without
   the fix; `skipped` is a fair skip with its Backlog task or question recorded; `disagree` you
   accept or reject, with your reason.
4. **Regressions:** look for what the diff itself broke, and only that.
5. Add a `## Re-review <date>` section to the review with one line per finding and a new
   verdict line.
6. **Outcome:** all good → the substantive fixes are done. Anything wrong → send the named
   findings back to the review worker (SendMessage to its `local_…` id; it follows
   `review-fixes`, "Sent back after a re-review"). At most two rounds; after that, ask the user.
