---
name: verify
description: Run Lister's definition-of-done checks (format, lint, unit tests, build, and e2e when relevant) on everything affected by the current change, and report results. Use before saying work is done, before committing, or when the user asks to check/verify/test the change.
---

# Verify a change

Run from the repo root. Use static output so results are readable:

```bash
NX_TUI=false npx nx format:check
NX_TUI=false npx nx affected -t lint test build --outputStyle=static
```

`affected` compares against `main`. In a repo with no commits yet, or if `affected` errors about the base, run everything instead:

```bash
NX_TUI=false npx nx run-many -t lint test build --outputStyle=static
```

When user-facing behaviour or an HTTP route changed, also run the e2e suites (they start the servers):

```bash
NX_TUI=false npx nx e2e lister-api-e2e --outputStyle=static
NX_TUI=false npx nx e2e lister-web-e2e --outputStyle=static
```

Playwright needs browsers once per machine: `npx playwright install --with-deps chromium` (ask the user before installing system packages).

## On failure

- Format: run `npx nx format:write`, then re-check.
- Lint `@nx/enforce-module-boundaries`: fix the import (wrong scope/type or a relative import across projects). Don't loosen the rule.
- Tests/build: fix the cause. Don't skip, `.only`, or delete tests to get green.
- A stale result: `npx nx reset` clears the cache and daemon.

## Report

Say exactly what ran and what passed or failed, quoting the failing output. If a step was skipped (e.g. e2e because browsers aren't installed), say so.
