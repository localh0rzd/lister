# Lister

Reusable, composable checklists (packing lists first), edited together in real time, usable offline as a PWA.
Nx monorepo: **Angular** web app + **NestJS** API, sharing TypeScript libraries.

- **Design and decisions:** [docs/design.md](docs/design.md). Read the relevant sections before touching data, sync, composition or checklists. If a change would contradict it, update the doc first and tell the user.
- **Open decisions:** listed near the top of `docs/design.md`, each naming the first task that needs it. Before starting such a task, check whether it has been answered; if not, ask the user once and propose the default. Record answers in the doc's Decisions table.
- **Work items:** [TASKS.md](TASKS.md) — use the `tasks` skill to pick one up.
- **How every change is made:** follow the `best-practices`, `testing` and `module-boundaries` skills for every implementation, every time. Tasks are committed one at a time on the `work/v1` branch, and each one gets a critical review in a separate session before the next starts (`tasks` and `task-review` skills).

## Stack (installed versions — check `package.json` before assuming APIs)

- Nx 24 (integrated layout: `project.json` + `tsconfig.base.json` paths, one root `package.json`)
- Angular 22: standalone, zoneless, signals, esbuild (`@angular/build`), Vitest via `@angular/build:unit-test` (libraries: Vitest with the Analog Angular plugin); Angular Material 22 + CDK, Roboto and Material Symbols from npm
- NestJS 11 on Express 5, bundled with webpack (`@nx/webpack`)
- **Vitest for every unit, integration and API e2e test** (no Jest anywhere), Playwright for web e2e
- TypeScript 6, ESLint 9 flat config, Prettier
- Node from `.nvmrc` (managed with fnm), npm as package manager. `.npmrc` sets `legacy-peer-deps=false` and `strict-peer-deps=true`: installs fail on peer conflicts
- Planned, each added by its task (don't swap in alternatives; reasons in docs/design.md §4): `@angular/service-worker`, Dexie 4, Socket.IO 4 (`@nestjs/platform-socket.io` 11.x), Drizzle 0.45 + `better-sqlite3` 13, Zod 4, `fractional-indexing`, `uuid` (v7), `@simplewebauthn/server` + `@simplewebauthn/browser` 14

## Layout

```
apps/
  lister-web/          Angular SPA            (scope:web,  type:app)  :4200
  lister-web-e2e/      Playwright e2e         (scope:web,  type:e2e)
  lister-api/          NestJS API, /api/*     (scope:api,  type:app)  :3000
  lister-api-e2e/      Vitest + axios e2e     (scope:api,  type:e2e)
packages/
  shared/api-contracts/  DTO types + route helpers, @lister/shared/api-contracts (scope:shared, type:util)
  web/ui/                presentational components, @lister/web/ui (scope:web, type:ui)
  web/util-theme/        theme preference + theme-color, @lister/web/util-theme (scope:web, type:util)
```

New libraries go in `packages/<scope>/<name>`, where scope is `web`, `api` or `shared`, with import path `@lister/<scope>/<name>`.
Apps stay thin: they wire routes, modules and config. **Every bigger feature gets its own library from its first line of code.** The `module-boundaries` skill says what counts as bigger and how to create the library.
The planned libraries and their tags are in docs/design.md §5; create each one when its task comes up, and add any new library to §5.

## Domain and architecture (summary of docs/design.md)

- **List**: reusable, composable, no check state. **Item**: belongs to exactly one list. **Include**: list A contains list B, any depth, never a cycle; a list reached twice appears once. A live reference: editing a list changes every list that includes it (D2).
- **Run**: a one-off checklist, started from a list (its items are copied in when it starts, D2) or empty (ad-hoc); identical items are merged into one (D16). Holds checked/skipped state; when every item is checked or skipped it finishes and is never listed again (D10). The UI says "run" too (destination "Runs").
- **Users and spaces**: admins create and manage all accounts (no self-registration); sign-in with username and password, or with passkeys. A **space** owns lists and runs, and all its members can edit them (D14: a personal space per user, plus shared spaces whose owner adds members).
- **Local-first:** the web app reads synced data from IndexedDB (Dexie) and changes it only through **mutations** via the sync engine. The server applies each mutation in a SQLite transaction and pokes the changed rows to the space over Socket.IO. REST is only for sign-in, passkeys, user administration, spaces, bootstrap, export and health.
- **Production:** one Docker container behind Traefik, which terminates HTTPS. The app speaks plain HTTP and takes its public URL from `PUBLIC_URL` (used for the WebSocket `Origin` check, `Secure` cookies and passkeys).
- **Conflicts:** per field, the change that reaches the server last wins; deletes win (rows become tombstones); a mutation that breaks a rule (cycle, permission, validation) is rejected and rolled back on the client.
- The sync infrastructure is built by T-004 – T-014. Don't build synced features on REST CRUD as a stopgap before it exists.
- UI text is English only.

## Commands

Always run through Nx, from the repo root (`npx nx …`). Never call `ng`, `vitest` or `webpack` directly.

| What                                       | Command                                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Dev (API + web, proxied)                   | `npm start` → http://localhost:4200, API at `/api`                                           |
| One project                                | `npx nx serve lister-api` / `npx nx serve lister-web`                                        |
| Test / lint / build one project            | `npx nx test lister-web`, `npx nx lint lister-api`, `npx nx build lister-web`                |
| Everything touched by your change          | `npx nx affected -t lint test build`                                                         |
| Workspace rules (tags, placement, aliases) | `npm run lint:workspace`                                                                     |
| E2E                                        | `npx nx e2e lister-web-e2e`, `npx nx e2e lister-api-e2e` (they start the servers themselves) |
| Format                                     | `npx nx format:write` (CI runs `format:check`)                                               |
| What exists                                | `npx nx show projects`, `npx nx show project <name>`, `npx nx graph`                         |

Tests run once and exit (`testMode: run`), so they're safe to run non-interactively.
Use `NX_TUI=false` or `--outputStyle=static` when you need plain, readable output.
Targets are mostly _inferred_ by plugins in `nx.json` — `project.json` may not list them; use `nx show project`.

## Generating code

Use Nx generators; don't hand-write project scaffolding (`project.json`, tsconfigs, eslint/vitest configs).
Defaults live in `nx.json > generators`: scss, the `lister` prefix, vitest-angular for Angular, and vitest for Nest and TS libraries. OnPush is Angular 22's default, so generated components don't set it. Always `--dry-run` first.
Library names follow `packages/<scope>/<name>`, project `<scope>-<name>`, import path `@lister/<scope>/<name>`.

```bash
npx nx g @nx/angular:library packages/web/feature-lists --name=web-feature-lists --importPath=@lister/web/feature-lists --tags=scope:web,type:feature --dry-run
npx nx g @nx/angular:component packages/web/feature-lists/src/lib/list-page/list-page --dry-run
npx nx g @nx/nest:library packages/api/feature-sync --name=api-feature-sync --importPath=@lister/api/feature-sync --tags=scope:api,type:feature --dry-run
npx nx g @nx/nest:resource packages/api/feature-auth/src/lib/users/users --dry-run   # REST only for non-synced data
npx nx g @nx/js:library packages/shared/<name> --name=shared-<name> --importPath=@lister/shared/<name> --tags=scope:shared,type:util --dry-run
```

## Dependencies

- All `nx` and `@nx/*` packages must be the **same exact version** (no `^`), since Nx plugins peer-depend on each other's exact version. Upgrade them together with `npx nx migrate latest`, never one by one.
- Peer conflicts are errors (`.npmrc`). Fix them; never use `--legacy-peer-deps` or `--force`. A conflict that only upstream can fix goes in `package.json > overrides`, scoped to the offending package, with a note in this section.
- Current override: `@oxc-parser/binding-wasm32-wasi` (optional dependency of `@angular/build`, only used on WebAssembly platforms) pins `@emnapi/*@2.0.0-alpha.6`, which its own `@napi-rs/wasm-runtime` peer range rejects. It's forced to `2.0.0-beta.3`. Remove the override once `@angular/build` ships a fixed binding.
- Jest is not used. Don't add `jest`, `ts-jest` or `@nx/jest`. (`@nx/eslint` pulls `@nx/jest` in transitively; that's Nx-internal.)
- Nest e2e: `@nx/nest:application` can only generate Jest e2e projects, so generate with `--e2eTestRunner=none` (the default here) and copy `apps/lister-api-e2e`'s Vitest setup.

## Module boundaries (strict: `@nx/enforce-module-boundaries` in lint, plus `npm run lint:workspace`)

Every project needs exactly one `scope:*` tag and one `type:*` tag. The details, and how to fix a violation, are in the `module-boundaries` skill.

- **Scopes:** `scope:web` → web + shared; `scope:api` → api + shared; `scope:shared` → shared only. **Web code never imports api code, and vice versa.** That includes npm packages:
  - web code can't import server packages (`@nestjs/*`, `drizzle-orm`, `better-sqlite3`, …);
  - api code can't import browser packages (`@angular/*`, `dexie`, …);
  - shared code can import neither.
- **Types:**
  - `type:app` and `feature` → feature/ui/data-access/util;
  - `ui` → ui/util, with no HTTP, Dexie or sockets;
  - `data-access` → data-access/util; `util` → util; `e2e` → util.
  - Web features reach Dexie and the socket only through data-access libraries.
- **Dependencies:** every imported npm package must be a direct dependency in `package.json`, and projects have no circular dependencies.
- **Imports:** import a library only through its `@lister/<scope>/<name>` alias, which points at its `src/index.ts`. Never use a relative path across project roots or reach into a library's internals.
- **No workarounds:** never disable or loosen these rules, add `allow` entries, or change tags to get green; move the code instead. Changing a rule is a design change, so ask the user first.

## Conventions

### Shared libraries (`packages/shared/*`)

- `api-contracts`: every request/response shape that crosses HTTP, as TypeScript interfaces. Both sides import it, so a contract change breaks both at compile time. Route paths are built with `apiPath(...)`.
- `domain` (from T-005): entity types, positions, flattening, cycle check, mutation apply rules — pure functions used by client and server alike.
- `sync-protocol` (from T-005): Zod schemas for mutations and socket messages, and the protocol version.
- Allowed: plain TypeScript and Zod. Not allowed: Angular, NestJS, `class-validator`, Node or browser-only APIs.

### Angular (`lister-web`)

- Standalone components with OnPush, which are both Angular 22 defaults: never write `standalone: true` or `changeDetection`. Selector prefix `lister-`. No NgModules, no `zone.js`.
- State: `signal`, `computed`, `linkedSignal`, `input()`, `output()`, `model()`. Avoid `@Input`/`@Output` decorators and manual subscriptions.
- DI via `inject()`, not constructor params. New singleton services use `@Service()` (Angular 22), not `@Injectable({ providedIn: 'root' })`.
- Lint enforces the modern APIs through `angularBestPractices` in the root `eslint.config.mjs`. Every Angular project's lint config spreads it.
- Templates: built-in control flow (`@if`, `@for` with `track`, `@switch`, `@defer`). No `*ngIf`/`*ngFor`.
- Synced data (lists, items, includes, runs): read through the local-database repositories (signals), change through sync-engine mutations. Never `HttpClient` or `httpResource()` for it.
- Other HTTP (sign-in, passkeys, user administration, spaces, export, health): `httpResource()` for reads, `HttpClient` in a data-access service for writes, URLs via `apiPath()`. The dev proxy (`apps/lister-web/proxy.conf.json`) forwards `/api` to `:3000`, and `/socket.io` once T-007 is done.
- UI: Angular Material 3 components and `--mat-sys-*` tokens. The navigation bar and rail are our own components in `packages/web/ui` (Material has none). Fonts and icons are self-hosted — never add Google Fonts links.
- Drag and drop (CDK) always has a keyboard alternative ("Move up / down"). Destructive actions offer Undo in a snackbar.
- PWA: the service worker only runs in production builds; test offline behaviour against the production build.
- Forms: Signal Forms (`@angular/forms/signals`) for new forms.
- Routes are lazy (`loadComponent` / `loadChildren`). Router inputs are bound to component inputs (`withComponentInputBinding`).
- Tests: Vitest + `TestBed`; mock HTTP with `provideHttpClientTesting()` + `HttpTestingController`.

### NestJS (`lister-api`)

- One Nest module per feature (`<feature>.module.ts`, `.controller.ts`, `.service.ts`), imported into `AppModule`.
- Global prefix `api` (from `API_PREFIX`). A global `ValidationPipe` with `whitelist` + `transform` is on: request bodies are DTO **classes** with `class-validator` decorators that `implements` the shared interface.
- Controllers stay thin; logic lives in services. Throw Nest HTTP exceptions (`NotFoundException`, …), don't build error responses by hand.
- Synced data has no REST CRUD endpoints. It changes only through mutation handlers in the sync feature: authorize → validate (Zod schema from `sync-protocol`) → apply → bump the space version, all inside one synchronous SQLite transaction — never `await` inside it. Mutations set values; they never toggle or increment.
- Database (from T-004): SQLite via Drizzle + `better-sqlite3`. Every schema change is a Drizzle migration **and** a matching Dexie version bump on the client, in the same change.
- Config comes from env vars (`PORT`, …). No secrets in the repo.
- Tests:
  - Units: Vitest + `@nestjs/testing`. Decorator metadata works out of the box; no SWC plugin is needed.
  - Integration: every route and socket event, tested through the real app in `apps/lister-api/src/integration/` (`createTestApp()`, from T-004).
  - Smoke: `apps/lister-api-e2e` (Vitest + axios) tests the built server.

## Definition of done

1. `npm run lint:workspace` and `npx nx affected -t lint test build` pass. Run `e2e` too when user-facing behaviour or a backend call changed.
2. `npx nx format:check` is clean.
3. The tests the `testing` skill requires exist: unit tests on both sides, an integration test for every backend call, and a Playwright happy path for every user-facing change.
4. The code follows the `best-practices` and `module-boundaries` skills.
5. If the work came from `TASKS.md`, the task is updated there, committed on `work/v1`, and reviewed by a separate review session (the `tasks` skill).
6. If the change departs from `docs/design.md`, the doc is updated in the same change.

Use the `verify` skill to run the checks.

## Project skills (`.claude/skills/`)

- `best-practices` — current best practices and the newest stable features for the installed versions; for every change
- `testing` — the tests every change needs: unit, integration for every backend call, and e2e happy paths
- `module-boundaries` — every bigger feature in its own library; the strict boundary rules
- `tasks` — pick up, implement, review and close items from `TASKS.md`: one commit per task on `work/v1`, then a review session
- `task-review` — the critical review that a separate session runs after every task
- `fullstack-feature` — feature across API and web: synced data via mutations, or plain HTTP
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
