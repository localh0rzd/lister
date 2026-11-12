---
name: verify
description: Run Lister's definition-of-done checks (workspace rules, format, lint, unit and integration tests, build, e2e when relevant, and whether the required tests exist) on everything affected by the current change, and report results. Use before saying work is done, before committing, or when the user asks to check/verify/test the change.
---

# Verify a change

Run these from the repo root, with static output so the results are readable:

```bash
npm run lint:workspace
NX_TUI=false npx nx format:check
NX_TUI=false npx nx affected -t lint typecheck test build --outputStyle=static
```

- `affected` compares against `master` (`defaultBase` in `nx.json`), and it includes uncommitted
  changes. On `work/v1`, that covers everything since the branch left `master`.
- To check a single task's commits, pass `--base=<commit> --head=<commit>`.
- If `affected` errors about the base, run everything instead:

```bash
NX_TUI=false npx nx run-many -t lint typecheck test build --outputStyle=static
```

API integration tests run as part of `test`, in `lister-api`.

When user-facing behaviour, an HTTP route, a socket event or the server setup changed, also run
the e2e suites. They start the servers themselves:

```bash
NX_TUI=false npx nx e2e lister-web-e2e --outputStyle=static
NX_TUI=false npx nx e2e lister-api-e2e --outputStyle=static
```

Playwright needs its browser once per machine: `npx playwright install --with-deps chromium`.
Ask the user before installing system packages.

## Are the required tests there?

Green checks don't help if a test is missing. Go through the change and confirm what the
`testing` skill requires:

- every new or changed unit has a `*.spec.ts` next to it;
- every new or changed HTTP route and socket event has an integration test in
  `apps/lister-api/src/integration/`;
- every new or changed user-facing flow has a Playwright happy-path spec;
- synced features also have the two-context and offline specs.

A required test that's missing is a failure, the same as a red check.

## On failure

- **Format:** run `npx nx format:write`, then check again.
- **Lint `@nx/enforce-module-boundaries`, or `lint:workspace`:** fix the structure, following the
  `module-boundaries` skill: wrong scope or type, a relative or deep import, a missing tag or
  alias, a transitive dependency. Never loosen the rule.
- **Angular best-practice lint rules:** switch to the modern API that the message names.
- **Tests or build:** fix the cause. Don't skip, `.only` or delete tests to get green.
- **A stale result:** `npx nx reset` clears the cache and the daemon.

## Report

Say exactly what ran and what passed or failed, quoting the failing output. If a step was
skipped (for example e2e, because the browsers aren't installed), say so.
