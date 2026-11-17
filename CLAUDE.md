# Lister

Reusable, composable checklists (packing lists first), edited together in real time, usable offline as a PWA.
Nx monorepo: **Angular** web app + **NestJS** API, sharing TypeScript libraries.

- **Design and decisions:** [docs/design.md](docs/design.md). Read the relevant sections before touching data, sync, composition or checklists. If a change would contradict it, update the doc first and tell the user.
- **Open decisions:** listed near the top of `docs/design.md`, each naming the first task that needs it. Before starting such a task, check whether it has been answered; if not, ask the user once and propose the default. Record answers in the doc's Decisions table.
- **Work items:** [TASKS.md](TASKS.md) — use the `tasks` skill to pick one up.
- **How every change is made:** follow the `best-practices`, `testing` and `module-boundaries` skills for every implementation, every time, plus `angular-feature`, `nest-feature` or `fullstack-feature` for the area. Tasks are committed one at a time on the `work/v1` branch, and each one gets a critical review in a separate session before the next starts (`tasks` and `task-review` skills).

## Stack (installed versions — check `package.json` before assuming APIs)

- Nx 24 (integrated: `project.json` + `tsconfig.base.json` paths, one root `package.json`); targets are mostly _inferred_ by plugins, so use `npx nx show project <name>`
- Angular 22: standalone, zoneless, signals, esbuild, Angular Material 22 + CDK, `@angular/service-worker`
- NestJS 11 on Express 5, bundled with webpack
- **Vitest for every unit, integration and API e2e test** (no Jest anywhere), Playwright for web e2e
- TypeScript 6, ESLint 9 flat config, Prettier; Node from `.nvmrc` (fnm), npm
- Data and sync (don't swap in alternatives; reasons in docs/design.md §4): Dexie 4, Socket.IO 4, Drizzle 0.45 + `better-sqlite3`, Zod 4, `fractional-indexing`, `uuid` (v7), `@simplewebauthn/*` 14

## Layout

`apps/`: `lister-web` (Angular SPA, :4200), `lister-web-e2e` (Playwright), `lister-api` (NestJS, `/api/*`, :3000), `lister-api-e2e` (Vitest + axios smoke).

`packages/<scope>/<name>`, project `<scope>-<name>`, import path `@lister/<scope>/<name>`:

- **shared:** `api-contracts` (HTTP DTO types, `apiPath()`), `domain` (entities, ids, positions, flattening, cycle check), `sync-protocol` (Zod schemas for mutations and socket messages, `applyMutation()`)
- **api:** `data-access-db` (SQLite + Drizzle, migrations), `feature-auth`, `feature-spaces`, `feature-sync`, `feature-maintenance` (backups, purge)
- **web:** `data-access-local-db` (Dexie, liveQuery signals, repositories), `data-access-sync` (sync engine, outbox, socket; `SpaceChanges`), `data-access-auth`, `feature-lists`, `feature-runs`, `feature-auth`, `feature-admin`, `feature-space`, `feature-settings`, `ui` (nav bar and rail), `util-theme`, `util-notify` (`Notifier`), `util-pwa`

Apps stay thin: they wire routes, modules and config. **Every bigger feature gets its own library from its first line of code** (`module-boundaries` skill). Planned libraries and their tags are in docs/design.md §5; add any new one there.

## Domain and architecture (summary of docs/design.md)

- **List**: reusable, composable, no check state. **Item**: belongs to exactly one list. **Include**: list A contains list B, any depth, never a cycle; a list reached twice appears once; a live reference (D2).
- **Run**: a one-off checklist, started from a list (items copied in, D2) or empty; identical items merged (D16). Holds checked/skipped state; when every item is checked or skipped it finishes and goes to the trash (D10, D20). The UI says "run" too.
- **Users and spaces**: admins manage accounts (no self-registration; registration links, D23); sign-in with password or passkeys. A **space** owns lists and runs; all its members can edit them (D14).
- **Local-first:** the web app reads synced data from IndexedDB (Dexie) and changes it only through **mutations** via the sync engine. The server applies each mutation in one SQLite transaction and pokes the changed rows to the space over Socket.IO, which is authenticated by the session cookie and checks membership on every pull and push. REST is only for sign-in, passkeys, user administration, spaces, bootstrap, export and health. **Never build synced data on REST CRUD** (Path A of `fullstack-feature`).
- **Conflicts:** per field, last write to reach the server wins; deletes win (tombstones); a mutation that breaks a rule is rejected and rolled back on the client.
- **Production:** one Docker container behind Traefik (HTTPS there); the app speaks HTTP and takes its public URL from `PUBLIC_URL`.
- UI text is English only.

## Commands

Always run through Nx, from the repo root (`npx nx …`). Never call `ng`, `vitest` or `webpack` directly.

| What                                       | Command                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| Dev (API + web, proxied)                   | `npm start` → http://localhost:4200, API at `/api`                            |
| Production build locally (PWA, offline)    | `npm run start:prod` → http://localhost:3100                                  |
| Test / lint / build one project            | `npx nx test lister-web`, `npx nx lint lister-api`, `npx nx build lister-web` |
| Everything touched by your change          | `npx nx affected -t lint typecheck test build`                                |
| Workspace rules (tags, placement, aliases) | `npm run lint:workspace`                                                      |
| E2E (they start the servers themselves)    | `npx nx e2e lister-web-e2e`, `npx nx e2e lister-api-e2e`                      |
| Format                                     | `npx nx format:write` (CI runs `format:check`)                                |

Tests run once and exit. Use `NX_TUI=false` or `--outputStyle=static` for plain output.

## Generating code

Use Nx generators (`--dry-run` first); don't hand-write `project.json`, tsconfigs or eslint/vitest configs. Defaults are in `nx.json > generators`; the exact library commands are in `module-boundaries`. Every project gets a `typecheck` target from `tools/typecheck-plugin.mjs`.

## Dependencies

- All `nx` and `@nx/*` packages are the **same exact version** (no `^`); upgrade them together with `npx nx migrate latest`.
- Peer conflicts are errors (`.npmrc`: `strict-peer-deps=true`). Fix them; never `--legacy-peer-deps` or `--force`. A conflict only upstream can fix goes in `package.json > overrides`, scoped to the offending package, with a note here.
- Current override: `@oxc-parser/binding-wasm32-wasi` (optional dependency of `@angular/build`) forces `@emnapi/*` to `2.0.0-beta.3`, because its pinned `2.0.0-alpha.6` fails its own `@napi-rs/wasm-runtime` peer range. Remove it once `@angular/build` ships a fixed binding.
- No Jest: don't add `jest`, `ts-jest` or `@nx/jest` (`@nx/eslint` pulls `@nx/jest` in transitively; that's Nx-internal).

## Module boundaries (strict, lint-enforced)

Every project has exactly one `scope:*` and one `type:*` tag. Web code never imports api code or server packages, api code never imports browser packages, shared code imports neither; import libraries only through their `@lister/…` alias. **Never disable or loosen these rules, add `allow` entries or change tags to get green**: move the code instead, and ask the user before changing a rule. Details and fixes: `module-boundaries`.

## Definition of done

1. `npm run lint:workspace` and `npx nx affected -t lint typecheck test build` pass. Run `e2e` too when user-facing behaviour or a backend call changed.
2. `npx nx format:check` is clean.
3. The tests the `testing` skill requires exist: unit tests on both sides, an integration test for every backend call, and a Playwright happy path for every user-facing change.
4. The code follows the `best-practices` and `module-boundaries` skills.
5. If the work came from `TASKS.md`, the task is updated there, committed on `work/v1`, and reviewed by a separate review session (the `tasks` skill).
6. If the change departs from `docs/design.md`, the doc is updated in the same change.

Use the `verify` skill to run the checks. For Nx questions use the `nx-workspace` and `nx-generate` skills; never guess CLI flags.
