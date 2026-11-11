# Lister

Nx monorepo: **Angular** web app + **NestJS** API, sharing TypeScript contracts.
Work items live in [TASKS.md](TASKS.md) — use the `tasks` skill to pick one up.

## Stack (installed versions — check `package.json` before assuming APIs)

- Nx 24 (integrated layout: `project.json` + `tsconfig.base.json` paths, one root `package.json`)
- Angular 22: standalone, zoneless, signals, esbuild (`@angular/build`), Vitest via `@angular/build:unit-test`
- NestJS 11 on Express, bundled with webpack (`@nx/webpack`)
- **Vitest for every unit and API e2e test** (no Jest anywhere), Playwright for web e2e
- TypeScript 6, ESLint 9 flat config, Prettier
- Node from `.nvmrc` (managed with fnm), npm as package manager. `.npmrc` sets `legacy-peer-deps=false` and `strict-peer-deps=true`: installs fail on peer conflicts

## Layout

```
apps/
  lister-web/          Angular SPA            (scope:web,  type:app)  :4200
  lister-web-e2e/      Playwright e2e         (scope:web,  type:e2e)
  lister-api/          NestJS API, /api/*     (scope:api,  type:app)  :3000
  lister-api-e2e/      Vitest + axios e2e     (scope:api,  type:e2e)
packages/
  shared/api-contracts/  DTO types + route helpers, @lister/shared/api-contracts (scope:shared, type:util)
```

New libraries go in `packages/<scope>/<name>`, where scope is `web`, `api` or `shared`, with import path `@lister/<scope>/<name>`.
Apps stay thin: they wire routes, modules and config. Features go in libraries once an app grows past a couple of features.

## Commands

Always run through Nx, from the repo root (`npx nx …`). Never call `ng`, `vitest` or `webpack` directly.

| What                              | Command                                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| Dev (API + web, proxied)          | `npm start` → http://localhost:4200, API at `/api`                                           |
| One project                       | `npx nx serve lister-api` / `npx nx serve lister-web`                                        |
| Test / lint / build one project   | `npx nx test lister-web`, `npx nx lint lister-api`, `npx nx build lister-web`                |
| Everything touched by your change | `npx nx affected -t lint test build`                                                         |
| E2E                               | `npx nx e2e lister-web-e2e`, `npx nx e2e lister-api-e2e` (they start the servers themselves) |
| Format                            | `npx nx format:write` (CI runs `format:check`)                                               |
| What exists                       | `npx nx show projects`, `npx nx show project <name>`, `npx nx graph`                         |

Tests run once and exit (`testMode: run`), so they're safe to run non-interactively.
Use `NX_TUI=false` or `--outputStyle=static` when you need plain, readable output.
Targets are mostly _inferred_ by plugins in `nx.json` — `project.json` may not list them; use `nx show project`.

## Generating code

Use Nx generators; don't hand-write project scaffolding (`project.json`, tsconfigs, eslint/vitest configs).
Defaults live in `nx.json > generators` (scss, `lister` prefix, OnPush, vitest-angular for Angular, vitest for Nest and TS libs). Always `--dry-run` first.

```bash
npx nx g @nx/angular:library packages/web/feature-lists --tags=scope:web,type:feature --dry-run
npx nx g @nx/angular:component packages/web/feature-lists/src/lib/list-page/list-page --dry-run
npx nx g @nx/nest:library packages/api/lists --tags=scope:api,type:feature --dry-run
npx nx g @nx/nest:resource apps/lister-api/src/app/lists/lists --dry-run
npx nx g @nx/js:library packages/shared/<name> --tags=scope:shared,type:util --dry-run
```

## Dependencies

- All `nx` and `@nx/*` packages must be the **same exact version** (no `^`), since Nx plugins peer-depend on each other's exact version. Upgrade them together with `npx nx migrate latest`, never one by one.
- Peer conflicts are errors (`.npmrc`). Fix them; never use `--legacy-peer-deps` or `--force`. A conflict that only upstream can fix goes in `package.json > overrides`, scoped to the offending package, with a note in this section.
- Current override: `@oxc-parser/binding-wasm32-wasi` (optional dependency of `@angular/build`, only used on WebAssembly platforms) pins `@emnapi/*@2.0.0-alpha.6`, which its own `@napi-rs/wasm-runtime` peer range rejects. It's forced to `2.0.0-beta.3`. Remove the override once `@angular/build` ships a fixed binding.
- Jest is not used. Don't add `jest`, `ts-jest` or `@nx/jest`. (`@nx/eslint` pulls `@nx/jest` in transitively; that's Nx-internal.)
- Nest e2e: `@nx/nest:application` can only generate Jest e2e projects, so generate with `--e2eTestRunner=none` (the default here) and copy `apps/lister-api-e2e`'s Vitest setup.

## Module boundaries (enforced by `@nx/enforce-module-boundaries` in lint)

Every project needs one `scope:*` and one `type:*` tag.

- `scope:web` → web + shared; `scope:api` → api + shared; `scope:shared` → shared only. **The web app never imports from api code and vice versa.**
- `type:app` → feature/ui/data-access/util; `feature` → feature/ui/data-access/util; `ui` → ui/util; `data-access` → data-access/util; `util` → util.
- Import libraries by their `@lister/...` alias, never by relative path across project roots.

## Conventions

### Shared contracts (`@lister/shared/api-contracts`)

- Every request/response shape that crosses HTTP is a TypeScript interface here. Both sides import it, so a contract change breaks both at compile time.
- Plain TS only: no Angular, NestJS, `class-validator` or Node imports. Route paths are built with `apiPath(...)`.

### Angular (`lister-web`)

- Standalone components only, `ChangeDetectionStrategy.OnPush`, selector prefix `lister-`. No NgModules, no `zone.js`.
- State: `signal`, `computed`, `linkedSignal`, `input()`, `output()`, `model()`. Avoid `@Input`/`@Output` decorators and manual subscriptions.
- DI via `inject()`, not constructor params.
- Templates: built-in control flow (`@if`, `@for` with `track`, `@switch`, `@defer`). No `*ngIf`/`*ngFor`.
- HTTP reads: `httpResource()` / `resource()`. Writes: `HttpClient` in a data-access service. Use `apiPath()` for URLs; the dev proxy (`apps/lister-web/proxy.conf.json`) forwards `/api` to `:3000`.
- Forms: Signal Forms (`@angular/forms/signals`) for new forms.
- Routes are lazy (`loadComponent` / `loadChildren`). Router inputs are bound to component inputs (`withComponentInputBinding`).
- Tests: Vitest + `TestBed`; mock HTTP with `provideHttpClientTesting()` + `HttpTestingController`.

### NestJS (`lister-api`)

- One Nest module per feature (`<feature>.module.ts`, `.controller.ts`, `.service.ts`), imported into `AppModule`.
- Global prefix `api` (from `API_PREFIX`). A global `ValidationPipe` with `whitelist` + `transform` is on: request bodies are DTO **classes** with `class-validator` decorators that `implements` the shared interface.
- Controllers stay thin; logic lives in services. Throw Nest HTTP exceptions (`NotFoundException`, …), don't build error responses by hand.
- Config comes from env vars (`PORT`, …). No secrets in the repo.
- Tests: Vitest + `@nestjs/testing` for units (decorator metadata works out of the box, no SWC plugin needed); `apps/lister-api-e2e` (Vitest + axios) for HTTP-level tests.

## Definition of done

1. `npx nx affected -t lint test build` passes (and `e2e` when user-facing behaviour changed).
2. `npx nx format:check` is clean.
3. New behaviour has tests next to the code (`*.spec.ts`).
4. If the work came from `TASKS.md`, the task is updated there.

Use the `verify` skill to run this.

## Project skills (`.claude/skills/`)

- `tasks` — pick up, implement and close items from `TASKS.md`
- `fullstack-feature` — end-to-end feature: contract → Nest endpoint → Angular UI → tests
- `angular-feature` — Angular components, routes, libraries, data access
- `nest-feature` — Nest modules, controllers, DTOs, validation
- `verify` — the definition-of-done checks

The Nx plugin (`.claude/settings.json`) adds the Nx MCP server and the `nx-workspace`, `nx-generate`, `nx-run-tasks` and related skills.

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->
