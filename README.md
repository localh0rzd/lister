# Lister

Lister keeps reusable, composable checklists — packing lists first — that several people can edit
and check off together in real time, also offline, as an installable PWA. The design and all
decisions are in [docs/design.md](docs/design.md).

Nx monorepo with an Angular 22 web app and a NestJS API sharing TypeScript libraries.

| Project                             | Path                            | What                                                                 |
| ----------------------------------- | ------------------------------- | -------------------------------------------------------------------- |
| `lister-web`                        | `apps/lister-web`               | Angular SPA (standalone, zoneless, signals) — http://localhost:4200  |
| `lister-api`                        | `apps/lister-api`               | NestJS REST API under `/api` — http://localhost:3000/api             |
| `shared-api-contracts`              | `packages/shared/api-contracts` | Request/response types used by both (`@lister/shared/api-contracts`) |
| `lister-web-e2e` / `lister-api-e2e` | `apps/*-e2e`                    | Playwright (web) and Vitest + axios (API) e2e suites                 |

## Setup

Node version is pinned in `.nvmrc` (use `fnm use` or `nvm use`).

```bash
npm install
npm start          # API + web together; web proxies /api to the API
```

## Common commands

```bash
npx nx test lister-web               # one project
npx nx affected -t lint test build   # everything your change touches
npm run lint:workspace               # project tags, library placement and import aliases (CI runs it)
npx nx e2e lister-web-e2e            # first run: npx playwright install chromium
npx nx graph                         # project graph
npm run icons                        # regenerate the PWA icons (tools/generate-pwa-icons.mjs)
npx nx run api-data-access-db:db-generate --name=<change>   # migration from the Drizzle schema
npx nx format:write
```

## Environment variables

| Var             | Used by    | Default                                                                     |
| --------------- | ---------- | --------------------------------------------------------------------------- |
| `PORT`          | lister-api | `3000`                                                                      |
| `DATABASE_PATH` | lister-api | `data/lister.db` (relative to the working directory; the folder is created) |

## Working with Claude Code

- `docs/design.md` — design, decisions, and the **open decisions** (answer them in chat or edit the file).
- `CLAUDE.md` — stack, layout, conventions, definition of done.
- `TASKS.md` — the backlog. Add tasks there and ask Claude to "work on the next task".
- How Claude works through the backlog:
  - Each task is one commit on the `work/v1` branch, and nothing is pushed or merged without asking.
  - After each task, a separate review session reviews the commit critically and writes its report to `tmp/reviews/<task>.md`. Claude fixes the findings in a second commit before starting the next task.
  - Claude stops at the end of each milestone with a summary.
- `.claude/skills/` — project skills:
  - `best-practices`, `testing` and `module-boundaries` apply to every change;
  - `tasks` and `task-review` cover the backlog and the reviews;
  - `fullstack-feature`, `angular-feature`, `nest-feature` and `verify` cover feature work and the final checks.
- `.claude/settings.json` enables the official Nx plugin (Nx MCP server + Nx skills).
