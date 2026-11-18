---
name: nest-feature
description: Conventions and steps for NestJS work in lister-api — feature modules, controllers, services, DTO validation, errors, config and tests. Use when adding or changing anything in apps/lister-api or packages/api/*.
---

# NestJS feature work (lister-api)

Always load `best-practices` and `testing` too, and `module-boundaries` when you create a library or add an import from another project.

## Where code goes

- **Bigger features get their own library from the start.** The `module-boundaries` skill says
  what counts as bigger and gives the exact generator command:
  `npx nx g @nx/nest:library packages/api/<name> --name=api-<name> --importPath=@lister/api/<name> --tags=scope:api,type:feature --dry-run`.
- **Planned api libraries** (docs/design.md §5): `data-access-db`, `feature-auth`,
  `feature-spaces` and `feature-sync`.
- **The app** (`apps/lister-api`) holds `main.ts`, the shared app setup, `AppModule` (which
  imports the feature modules), and small app-wide pieces such as health.
- **Generate, don't hand-roll:**

```bash
npx nx g @nx/nest:resource packages/api/<lib>/src/lib/<feature>/<feature> --type=rest --crud --dry-run   # REST only: auth, passkeys, users, spaces
npx nx g @nx/nest:service packages/api/<lib>/src/lib/<feature>/<name> --dry-run
```

Delete the generated files you don't need. **Synced data (lists, items, includes, runs) never
gets REST CRUD endpoints.** It changes through mutations, applied by `MutationService` with the shared rules (see below).

## Structure

```
<feature>/
  <feature>.module.ts       imports/providers/exports for the feature
  <feature>.controller.ts   HTTP only: params, DTOs, status codes
  <feature>.service.ts      business logic, injectable, unit-tested
  dto/create-<x>.dto.ts     validated request classes
```

- **Routes:** all routes live under the global prefix `api` (`API_PREFIX` from
  `@lister/shared/api-contracts`).
- **Return types:** controller methods return the **shared contract interfaces**, so the
  compiler checks the response shape.
- **Injection:** constructor injection with `private readonly` parameters. That's Nest's way;
  `inject()` is Angular's.
- **Express 5 paths** (Nest 11): name wildcards (`*splat`) and write optional segments as
  `{/:id}`. The query parser is `simple`.

## DTOs & validation

A global `ValidationPipe({ whitelist: true, transform: true })` covers REST request bodies
(sign-in, user administration, spaces). Mutations and socket messages are validated
with the shared Zod schemas instead.

```ts
import { IsString, Length } from 'class-validator';
import type { LoginRequest } from '@lister/shared/api-contracts';

export class LoginDto implements LoginRequest {
  @IsString()
  @Length(1, 100)
  login!: string;

  @IsString()
  @Length(8, 200)
  password!: string;
}
```

- **Where the types live:** DTO classes live in the API, because they use decorators. The
  interface they implement lives in the shared contracts library. `api-contracts` holds types
  and `apiPath()` only: no Zod or other runtime validation there, because the web app's main
  bundle imports it and goes over budget (T-064). Validate query params with class-validator too.
- **Update DTOs:** use `PartialType` from `@nestjs/mapped-types`.
- **Path params:** `@Param('id', ParseUUIDPipe)`, or the right `Parse*Pipe`.
- **HTTP writes:** anything but GET, HEAD or OPTIONS must send a JSON body or none, from the app's origin: `SameOriginGuard` answers anything else with 403/415. File uploads would need a design change first.

## Synced data: mutations

Lists, items, includes and runs change only through the Socket.IO sync gateway
(`docs/design.md` §4.2), in `packages/api/feature-sync`. There's no handler per mutation:
`MutationService.apply()` (`mutation.service.ts`) does, for every pushed entry:

1. **Authorizes:** the sender is a member of the mutation's space (otherwise "You can't change
   this space", also for a space that doesn't exist, and nothing is recorded).
2. **Replays:** a known `mutationId` gets its stored answer (`processed_mutations`).
3. **Validates:** `parseMutation()` (the Zod schemas from `@lister/shared/sync-protocol`).
4. **Applies** the shared rules, `applyMutation()` from `sync-protocol`, over `SqlRowStore`
   (the transaction). The rules are also the client's prediction, so a new mutation is a
   `case` there, not server code.
5. **Stamps** the changed rows with the space's next version and records the answer.
6. `SyncGateway` **answers** with an ack carrying the version, or a rejection with the rule's
   human-readable reason (users see it), and pokes the changed rows to the space's room.

The step-by-step recipe, with every file a new entity touches, is Path A of the
`fullstack-feature` skill.

Rules:

- **One transaction:** all of it happens in **one synchronous `better-sqlite3` transaction**,
  with no `await` inside. That's what keeps mutations strictly ordered.
- **Idempotent:** mutations set values; they never toggle or increment. Creates use the
  client's id. A repeated mutation id returns the stored result.
- **Delete wins:** updates to a tombstoned row (or to the items of a deleted list) are ignored
  and acked at the current version.
- **Tests:** `mutation.service.spec.ts` on `createTestDatabase()`, plus the socket integration
  test `apps/lister-api/src/integration/sync.integration.spec.ts`.

## Errors

- Throw the built-in exceptions: `NotFoundException`, `BadRequestException`,
  `ConflictException`, and so on.
- Don't catch and rewrap unless you add information. Cross-cutting error shaping goes in an
  exception filter.

## Config & secrets

- **Env vars:** read config from env vars, through `@nestjs/config` with a validated schema once
  there are more than a couple. Defaults are for local development only.
- **Secrets:** no secrets, tokens or connection strings are committed. Document every new env
  var in `README.md`.
- **Shutdown:** `app.enableShutdownHooks()`, so the database closes cleanly when Docker stops the
  container.
- **Logging:** in production, structured logs (`new ConsoleLogger({ json: true })`) with no
  secrets in them.

## Persistence

- **Database:** SQLite through Drizzle ORM 0.45 and `better-sqlite3` 13, in
  `packages/api/data-access-db` (`openDatabase()`, `DatabaseConnection`). Connection pragmas: WAL, `foreign_keys=ON`,
  `busy_timeout`, `synchronous=NORMAL`.
- **Schema changes:**
  - Edit `src/lib/schema.ts` and generate a migration:
    `npx nx run api-data-access-db:db-generate --name=<change>`. Migrations are committed and
    applied on startup.
  - Bump the Dexie schema version on the client in the same change.
- **Synced tables** carry `id` (a client UUIDv7), `space_id`, `version`, `deleted_at`,
  `created_by`, `updated_by` and timestamps (`docs/design.md` §3). Synced rows are never
  hard-deleted, except by the tombstone purge job.
- **Tests:** use a fresh, migrated in-memory database: `createTestDatabase()` from
  `@lister/api/data-access-db`.
- **No other stack:** don't introduce another database or ORM.
- **`better-sqlite3`'s install script** is approved in `package.json > allowScripts` (npm 11
  blocks unapproved ones); re-approve after upgrading it
  (`npm install-scripts approve better-sqlite3`).

## Tests

What's required is in the `testing` skill. For the API:

- **Unit:** `npx nx test lister-api`, or the library's project name (Vitest with
  `@nestjs/testing`). Build a testing module with the class under test and mocked collaborators
  (`{ provide: X, useValue: mock }`), or a fresh in-memory database when the logic is SQL.
- **Integration (every route and socket event):**
  - Put them in `apps/lister-api/src/integration/<area>.integration.spec.ts`.
  - `createTestApp()` (`apps/lister-api/src/testing/`) gives the real `AppModule` with `main.ts`'s setup, a fresh
    in-memory database and a random port. Call it with `fetch`, or with `socket.io-client` for
    the gateway.
  - Cover the happy path and the failures: 400, 401, 403, 404 and 409 for HTTP; acks,
    rejections, retries, pokes and membership for sockets.
  - They run in `nx test lister-api`.
- **Smoke:** `npx nx e2e lister-api-e2e` (Vitest with axios) starts the built server and checks
  what needs the real process: startup, migrations, health, static hosting, and the origin check.
- **New Nest apps:** `@nx/nest:application` can only generate Jest e2e projects, so generate with
  `--e2eTestRunner=none` (the default here) and copy `apps/lister-api-e2e`'s Vitest setup.
