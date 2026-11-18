---
name: task-review
description: Critical, independent review of one finished Lister task (its commit range on the work branch) — correctness, the task's Done-when criteria, design conformance, tests, best practices, module boundaries, security, offline behaviour and accessibility — reported in tmp/reviews/<task-id>.md. Use when you were started as a review session for a task, or when the user asks for a review of a task's changes.
---

# Reviewing a finished task

You're reviewing another session's work on one TASKS.md task. Be sceptical and fair: assume
there are bugs until you've looked, and report only what you can show.

## Ground rules

- **Read-only until the report is written.** The only files you write are the report and
  scratch probes under `tmp/`. Run any checks you like. Tracked files, commits, branches, the
  stash and installed packages stay as you found them.
- **Scope:** the commit range in your brief. Start with `git diff --stat <base>..<head>`, then
  read the diff one file at a time (`git diff <base>..<head> -- <file>`). Read a whole changed
  file only when it's under ~150 lines; otherwise read ~60 lines around each hunk, and `grep -n`
  for the code it calls and the code that calls it. Problems that predate the range go under
  "Outside this task".
- **Every finding** gives file and line, what's wrong, a concrete scenario where it breaks
  (input, state, steps), a fix, and how sure you are ("unverified" for guesses). Leave out what
  Prettier and lint already enforce, and taste with no reason behind it.

## Steps

1. **Context:** the task's block in `TASKS.md` (Done when, Notes, Decisions), the
   `docs/design.md` sections it touches, `CLAUDE.md`, and the skills `best-practices`,
   `testing` and `module-boundaries`, plus `angular-feature`, `nest-feature` or
   `fullstack-feature`.
2. **Done when:** mark every bullet met, partly met or not met, with evidence (file, test name).
3. **Checks** on `<head>`, following the `verify` skill's output rules (filtered output, full
   runs once, in the background with Monitor); record exactly what passed and what failed:
   - `npm run lint:workspace`
   - `npx nx format:check`
   - `NX_TUI=false npx nx affected -t lint typecheck test build --base=<base> --head=<head> --outputStyle=static`
   - the e2e suites, when user-facing behaviour or a backend call changed.
4. **Review** against the checklist below: every item, every changed file.
5. **Try to break it.** Probe the riskiest behaviour: edge-case input, a double submit, a retry,
   offline and reconnect, two clients, a non-member, a slow network, a cancelled or refused
   browser dialog, an extension that rejects or never answers. Probes live under `tmp/`, are
   described in the report and never committed.
6. **UI/UX:** when the task changes anything the web app shows, run the `ui-review` skill and
   append its "UI/UX" section to the report. Its findings count towards the verdict.
7. **Write the report** (below), with a severity and a tier on every finding.
8. **Fix the substantive findings** with the `review-fixes` skill, unless your brief says
   report only.

## Checklist

- **Correctness:**
  - Logic errors; edge cases (empty, one, many, duplicates, unicode, maximum lengths); error
    handling and what the user sees when something fails.
  - **Every `await` on something outside the app** (native dialog, browser API, extension,
    network, server): resolve, reject, abort and never-settles each bring the UI back to a
    usable idle state. Notices queued before a sign-in, sign-out or reload stay behind it.
    Probe these (step 5, `ui-review` "Cancelled, refused and interrupted flows") and ask for a
    test for each one that can be simulated.
  - Races and ordering, retries and idempotency, time zones.
  - Cleanup of subscriptions, sockets, timers and database handles.
- **Design conformance** (`docs/design.md`; behaviour that departs from it without the doc
  changing is a finding):
  - Decisions D1–D16 and the domain rules: runs copy their items when they start (D2),
    identical items merge (D16), the finishing rules (D10).
  - Synced data changes only through mutations, never REST CRUD or `HttpClient`. Mutations set
    values (no toggles), run in one synchronous transaction (no `await` inside).
  - Ids are client-generated UUIDv7; deleted rows become tombstones.
  - Every Drizzle migration has its matching Dexie version bump.
- **Tests:** every rule of the `testing` skill. Each test goes red if its behaviour breaks, and
  is deterministic (no sleeps, no `.only` or `.skip`).
- **Current practice:** every rule of the `best-practices` skill; check doubtful APIs against
  the installed typings.
- **Structure:** every rule of the `module-boundaries` skill; new libraries are in
  docs/design.md §5.
- **Security:**
  - Authentication and space membership checked on every route and socket event.
  - Input validated (DTO or Zod) at every boundary.
  - Secrets, tokens and passwords stay out of code, logs and error messages.
  - Cookies are `HttpOnly`, `SameSite`, and `Secure` when `PUBLIC_URL` is https.
  - Sign-in answers the same whether or not a username exists.
  - Templates bind text (no `innerHTML`, no `bypassSecurityTrust*`); SQL is parameterised.
- **Offline and sync:** works offline and converges after reconnecting; the outbox survives a
  reload; a rejected change is rolled back and shown; the service worker leaves `/api` and
  `/socket.io` to the network.
- **UX and accessibility** (code side; `ui-review` covers the screens): empty, loading, error,
  offline and "not synced yet" states; Undo for destructive actions; drag and drop has Move up /
  Move down; labels and focus handling; English UI text.
- **Performance:** lazy routes, `track` in every `@for`, light templates, indexes for new
  queries, no N+1 queries, within the bundle budgets.
- **Housekeeping:** the task is still In progress in `TASKS.md`; README env vars, CLAUDE.md and
  the skills follow any changed convention; no stray files, debug code, or TODO without a task
  ID; commit messages look like `T-NNN: …`.

## Report

Write `tmp/reviews/<task-id>.md` (git-ignored; create the folder if needed).

```markdown
# Review of T-NNN — <title>

Verdict: Changes requested | Approve with minor fixes | Approve
Range: <base>..<head> · <date>

## Findings

### 1. [blocker · substantive] <one-line summary>

`path/to/file.ts:42` — what's wrong. Scenario: … Fix: …

### 2. [nit · trivial] <one-line summary>

## Done when

- [x] <criterion> — evidence
- [ ] <criterion> — what's missing

## Checks run

- `<command>` — passed / failed (quote the failure)

## Outside this task

## Questions for the user
```

**Severity:**

- **blocker:** wrong behaviour, data loss, a security hole, a Done-when criterion not met, or a
  required test missing.
- **major:** a likely bug, a design violation, an outdated practice with a stable replacement,
  or a test that wouldn't catch the breakage it's meant to catch.
- **minor:** robustness or clarity that's cheap to fix now.
- **nit:** optional polish.

**Tier:**

- **trivial:** a mechanical, local fix that the finding spells out exactly (a wording, a
  missing test case for existing behaviour, a rename, a style tweak), with no design choice and
  nothing depending on it. You fix it after the substantive ones, with no re-review.
- **substantive:** everything else, and always every blocker and major. You fix it, and the
  coordinator re-reviews your fix diff.

When unsure, it's substantive.

**Verdict:** any blocker or major → **Changes requested**; only minors and nits → **Approve
with minor fixes**; nothing → **Approve**.

End your wrap-up recap (if you have one) and your final message with the verdict line, which
the coordinator reads first:

`Verdict: Changes requested — 1 blocker, 2 major, 3 minor, 1 nit (2 substantive, 5 trivial) — tmp/reviews/T-NNN.md`

When you've also fixed findings, `review-fixes` says what to add to it.
