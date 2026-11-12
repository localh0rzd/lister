---
name: task-review
description: Critical, independent review of one finished Lister task (its commit range on the work branch) — correctness, the task's Done-when criteria, design conformance, current best practices, required tests, module boundaries, security, offline behaviour and accessibility — reported in tmp/reviews/<task-id>.md. Use when you were started as a review session for a task, when asked to re-check review fixes, or when the user asks for a review of a task's changes.
---

# Reviewing a finished task

You're reviewing another session's work on one TASKS.md task. That session is waiting for your
report and will fix what you find. Be thorough, specific, sceptical and fair: assume there are
bugs until you've looked. Don't approve on trust, and don't invent problems either.

## Ground rules

- **Read-only.** Don't edit tracked files, commit, amend, switch branches, stash, reset or
  install packages. The only file you write is the report, plus scratch probes under `tmp/`.
  Run any checks you like (tests, lint, builds, e2e). If something needs to change, report it.
- **Scope:**
  - The review covers the commit range in your brief: `git log --stat <base>..<head>` and
    `git diff <base>..<head>`.
  - Read whole changed files, not just the hunks, plus the code they call and the code that
    calls them.
  - Problems that existed before the range go in their own short section.
- **Evidence for every finding:**
  - file and line, and what's wrong;
  - a concrete scenario where it breaks (input, state, steps);
  - a suggested fix.
  - Say how sure you are, and mark guesses "unverified".
- Don't report what Prettier or lint already enforce, or matters of taste with no reason
  behind them.

## Steps

1. **Context:**
   - The task's block in `TASKS.md` (Done when, Notes, Decisions).
   - The `docs/design.md` sections it touches, and `CLAUDE.md`.
   - The skills that apply: `best-practices`, `testing` and `module-boundaries`, plus
     `angular-feature`, `nest-feature` or `fullstack-feature`.
2. **Done when:** check every bullet against the code and the tests. Mark each one met, partly
   met or not met, with evidence (file, test name).
3. **Run the checks** on the reviewed commit:
   - `npm run lint:workspace`
   - `npx nx format:check`
   - `NX_TUI=false npx nx affected -t lint typecheck test build --base=<base> --head=<head> --outputStyle=static`
   - the e2e suites, when user-facing behaviour or a backend call changed.
   - Record exactly what passed and what failed.
4. **Review** against the checklist below.
5. **Try to break it.** Take the riskiest behaviour and probe it: edge-case input, a double
   submit, a retry, offline and reconnect, two clients, a non-member, a slow network. Write a
   probe test under `tmp/` if that helps, and describe it in the report. Never commit it.
6. **Write the report** (format below), then finish.

## Checklist

- **Correctness:**
  - Logic errors.
  - Edge cases: empty, one, many, duplicates, unicode, maximum lengths.
  - Error handling, and what the user sees when something fails.
  - Races and ordering, retries and idempotency, time zones.
  - Cleanup of subscriptions, sockets, timers and database handles.
- **Design conformance:**
  - Decisions D1–D16 and the domain rules: runs copy their items when they start (D2),
    identical items merge (D16), the finishing rules (D10).
  - Synced data changes only through mutations: no REST CRUD, no `HttpClient` for it.
  - Handlers run in one synchronous transaction, with no `await` inside.
  - Mutations set values and never toggle.
  - Ids are UUIDv7 and generated on the client; deleted rows become tombstones.
  - Every Drizzle migration comes with its matching Dexie version bump.
  - Behaviour that departs from docs/design.md without the doc changing is a finding.
- **Tests** (`testing` skill):
  - Unit tests for every new unit on both sides.
  - An integration test for every new or changed HTTP route and socket event, failure cases
    included.
  - A Playwright happy path for every user-facing change.
  - Would each test fail if the behaviour broke? Are they deterministic, with no sleeps and no
    `.only` or `.skip`?
- **Current practice** (`best-practices` skill):
  - Anything deprecated, legacy or experimental where a stable, newer API exists. Examples:
    decorator inputs, `*ngIf`, `@Injectable({ providedIn: 'root' })` on new services, explicit
    OnPush, `NgZone`, constructor injection in Angular, Reactive Forms for new forms, `any`,
    unnamed Express 5 wildcards.
  - When unsure, check the API against the installed typings.
- **Structure** (`module-boundaries` skill):
  - Bigger features live in their own library with the right tags, and the apps stay thin.
  - Public APIs are minimal, with no deep or relative imports across projects.
  - No disabled rules, new `allow` entries or changed tags.
  - New libraries are added to docs/design.md §5.
- **Security:**
  - Authentication and space-membership checks on every route and socket event.
  - Input validated (DTO or Zod) at every boundary.
  - No secrets, tokens or passwords in code, logs or error messages.
  - Cookies are `HttpOnly`, `SameSite`, and `Secure` when `PUBLIC_URL` is https.
  - Sign-in doesn't reveal whether a username exists.
  - No `innerHTML` and no `bypassSecurityTrust*`; raw SQL only with parameters.
- **Offline and sync:**
  - Works offline and converges after reconnecting.
  - The outbox survives a reload.
  - A rejected change is rolled back and shown to the user.
  - The service worker never serves `/api` or `/socket.io`.
- **UX and accessibility:**
  - Matches the mock-ups and Material 3.
  - Empty, loading, error, offline and "not synced yet" states.
  - Undo for destructive actions.
  - Keyboard paths: drag and drop also has Move up / Move down.
  - Labels, focus handling, and contrast in light and dark.
  - Layouts at 375 px and at 1280 px.
  - UI text in English.
- **Performance:**
  - Lazy routes and `track` in every `@for`.
  - No heavy work in templates.
  - Indexes for new queries, and no N+1 queries.
  - Within the bundle budgets.
- **Housekeeping:**
  - The task is still In progress in `TASKS.md`; it closes after the review.
  - README env vars, CLAUDE.md and the skills are updated if conventions changed.
  - No stray files, no debug code, no TODO without a task ID.
  - Commit messages look like `T-NNN: …`.

## Report

Write `tmp/reviews/<task-id>.md`; the folder is git-ignored, so create it if it's missing. If
the file already exists, this is a re-review: add a dated section, don't overwrite.

```markdown
# Review of T-NNN — <title>

Verdict: Changes requested | Approve with minor fixes | Approve
Range: <base>..<head> · <date>

## Findings

### 1. [blocker] <one-line summary>

`path/to/file.ts:42` — what's wrong. Scenario: … Fix: …

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
- **major:** a likely bug, a design violation, an outdated practice that has a stable
  replacement, or a test that wouldn't catch the breakage it's meant to catch.
- **minor:** robustness or clarity that's cheap to fix now.
- **nit:** optional polish.

**Verdict:**

- any blocker or major → **Changes requested**;
- only minors and nits → **Approve with minor fixes**;
- nothing → **Approve**.

End with one line that starts with the verdict, in your wrap-up recap if you have one and in
your final message:

`Verdict: Changes requested — 1 blocker, 2 major, 3 minor, 1 nit — tmp/reviews/T-NNN.md`

The implementing session sees that line first.

## Re-review

The implementing session may message you once it has fixed the findings, giving you a new range.

1. Review that range.
2. Check each earlier finding: fixed, not fixed, or declined with a reason you accept or don't.
3. Look for new problems the fixes introduced.
4. Add a `## Re-review <date>` section to the same report, and end with a new verdict line.
