# Lister

Nx monorepo with an Angular 22 web app and a NestJS API sharing TypeScript contracts.

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
npx nx e2e lister-web-e2e            # first run: npx playwright install chromium
npx nx graph                         # project graph
npx nx format:write
```

## Environment variables

| Var    | Used by    | Default |
| ------ | ---------- | ------- |
| `PORT` | lister-api | `3000`  |

## Working with Claude Code

- `CLAUDE.md` — stack, layout, conventions, definition of done.
- `TASKS.md` — the backlog. Add tasks there and ask Claude to "work on the next task".
- `.claude/skills/` — project skills: `tasks`, `fullstack-feature`, `angular-feature`, `nest-feature`, `verify`.
- `.claude/settings.json` enables the official Nx plugin (Nx MCP server + Nx skills).
