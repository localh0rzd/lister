---
name: module-boundaries
description: Where code goes in the Lister Nx workspace and how strictly module boundaries are enforced — every bigger feature gets its own Nx library with scope and type tags, apps only wire libraries together, and imports between projects follow lint-enforced rules. Use when starting a feature, creating a library, adding code to a new area, adding an import between projects, or when lint reports @nx/enforce-module-boundaries or `npm run lint:workspace` fails.
---

# Libraries and module boundaries

## Bigger features get their own library

A feature gets its own Nx library from its first line of code when any of these is true:

- it has its own route or page, or a Nest controller or gateway;
- it adds an entity, a table or a mutation type;
- it has more than about three components or services;
- other projects will use it;
- docs/design.md §5 lists it.

The apps keep only these:

- bootstrap, global providers and config;
- the route table, which lazy-loads feature libraries with `loadChildren`;
- the shell, and the `AppModule` imports;
- small app-wide pieces such as the health check.

When an app starts to hold feature logic, extract a library.

Split a feature by layer rather than building one big library:

| Type          | Holds                                                                                              | Examples                                                       |
| ------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `feature`     | web: routed pages and smart components; api: a Nest module with controllers, gateways and handlers | `packages/web/feature-lists`, `packages/api/feature-sync`      |
| `ui`          | presentational components: inputs and outputs only, no data services                               | `packages/web/ui`                                              |
| `data-access` | web: state, repositories, HTTP and socket clients; api: database access                            | `packages/web/data-access-sync`, `packages/api/data-access-db` |
| `util`        | pure functions and types, or small framework services that own no data (theme, PWA updates)        | `packages/shared/domain`, `packages/web/util-pwa`              |

Shared code (`packages/shared/*`) is always `type:util`: plain TypeScript and Zod, with no
Angular, Nest, Node or browser-only APIs.

If a new library isn't in docs/design.md §5 yet, add it there in the same change.

## Creating a library

Always use a generator. Run it with `--dry-run` first, then for real:

```bash
# Angular (web)
npx nx g @nx/angular:library packages/web/feature-lists --name=web-feature-lists --importPath=@lister/web/feature-lists --tags=scope:web,type:feature --dry-run
# Nest (api)
npx nx g @nx/nest:library packages/api/feature-sync --name=api-feature-sync --importPath=@lister/api/feature-sync --tags=scope:api,type:feature --dry-run
# Plain TypeScript (shared, or framework-free code in api or web)
npx nx g @nx/js:library packages/shared/domain --name=shared-domain --importPath=@lister/shared/domain --tags=scope:shared,type:util --dry-run
```

- **Naming:** folder `packages/<scope>/<name>`, project `<scope>-<name>`, import path
  `@lister/<scope>/<name>`.
- **Routed Angular feature libraries:** add
  `--routing --lazy --parent=apps/lister-web/src/app/app.routes.ts`, and check in the dry run
  that the parent route uses `loadChildren`.
- **After generating:**
  - Angular libraries: spread `angularBestPractices` in the new `eslint.config.mjs`, the way
    `apps/lister-web/eslint.config.mjs` does. Shared libraries: spread `sharedPlatformRules`
    (no Node built-ins, no browser globals).
  - Web libraries: add a `package.json` with `{ "name": "@lister/web-<name>", "private": true, "sideEffects": false }`,
    so esbuild drops unused barrel exports and lazy-only components stay out of the initial
    bundle (`lint:workspace` checks it).
  - Delete placeholder code you won't use (example component, service, spec).
  - `npm run lint:workspace` and `npx nx lint <project>` must pass.
- **Targets:** tests are generated with Vitest (the defaults in `nx.json`), and
  `npx nx show project <name>` lists the inferred targets.
- **Never `--buildable`:** libraries aren't buildable. A buildable library may only depend on
  buildable ones (`enforceBuildableLibDependency`), and the shared libraries aren't. Angular
  libraries therefore test with `vitest-analog` (the `nx.json` default); `vitest-angular` needs
  a buildable library.

## Public API

- **One entry point:** a library's only entry point is `src/index.ts`. Export the least that
  consumers need:
  - from a web feature, its routes (`export const listsRoutes: Routes`);
  - from an api feature, its Nest module;
  - from data-access, services and types;
  - from ui, components.
- **Importing other projects:**
  - Only through their alias, for example `@lister/web/ui`.
  - Never by a relative path into another project, and never into a library's internals.
  - Inside a library, use relative imports, and never its own alias.
- **Path aliases:** the only allowed form is `@lister/<scope>/<name>` →
  `packages/<scope>/<name>/src/index.ts`. The workspace check enforces this.

## The boundaries (enforced, not advice)

`@nx/enforce-module-boundaries` in the root `eslint.config.mjs` reports errors in every project.

**Projects:**

| A project tagged   | may import projects tagged             |
| ------------------ | -------------------------------------- |
| `scope:web`        | `scope:web`, `scope:shared`            |
| `scope:api`        | `scope:api`, `scope:shared`            |
| `scope:shared`     | `scope:shared`                         |
| `type:app`         | `feature`, `ui`, `data-access`, `util` |
| `type:feature`     | `feature`, `ui`, `data-access`, `util` |
| `type:ui`          | `ui`, `util`                           |
| `type:data-access` | `data-access`, `util`                  |
| `type:util`        | `util`                                 |
| `type:e2e`         | `util`                                 |

**npm packages:**

- **Web code** can't import server packages: `@nestjs/*`, `express`, `better-sqlite3`,
  `drizzle-orm`, `drizzle-kit`, `socket.io`, `class-validator`, `class-transformer`,
  `@simplewebauthn/server`.
- **API code** can't import browser packages: `@angular/*`, `dexie`, `@simplewebauthn/browser`.
- **Shared code** can import neither, nor `rxjs`, `reflect-metadata`, `axios` or
  `socket.io-client`.
- **`type:ui`** can't import `@angular/common/http`, `dexie` or `socket.io-client`.
- **Web features** can't import `dexie` or `socket.io-client`; they go through the data-access
  libraries.

**Also:**

- Every npm package a project imports must be a direct dependency in `package.json`
  (`banTransitiveDependencies`).
- There are no circular dependencies between projects.

`npm run lint:workspace` runs `tools/check-workspace.mjs`, in CI as well. It checks what ESLint
can't:

- every project has exactly one `scope:*` tag and one `type:*` tag;
- apps and e2e projects live in `apps/`;
- libraries live in `packages/<scope>/<name>`, with the matching scope tag and alias;
- every project is linted, every Angular project includes `angularBestPractices`, and every
  shared project includes `sharedPlatformRules`;
- every web library is marked `"sideEffects": false`.

## When a boundary is in your way

The structure is wrong, not the rule. Fix it with one of these:

- move the code down a layer: into a `util` or `data-access` library, or into
  `packages/shared`;
- split the library;
- pass data in through inputs, outputs or DI.

Never:

- `eslint-disable` for `@nx/enforce-module-boundaries`, a new `allow` entry, or loosened
  `depConstraints`;
- a tag changed just to make lint pass;
- a relative import across project roots, a deep import, or an extra path alias;
- code copied between projects to dodge a dependency.

Changing a rule itself (a new tag, constraint or banned package) is a design change. Ask the
user first. Then update `eslint.config.mjs`, `tools/check-workspace.mjs`, this skill, CLAUDE.md
and docs/design.md §5 together.

## Checks

- `npx nx lint <project>`
- `npm run lint:workspace`
- `npx nx graph --focus=<project>` shows what depends on what.
