---
name: nest-feature
description: Conventions and steps for NestJS work in lister-api — feature modules, controllers, services, DTO validation, errors, config and tests. Use when adding or changing anything in apps/lister-api or packages/api/*.
---

# NestJS feature work (lister-api)

Always load `best-practices`, `testing` and `module-boundaries` too.

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
npx nx g @nx/nest:resource packages/api/<lib>/src/lib/<feature>/<feature> --type=rest --crud --dry-run   # REST only: auth, passkeys, users, spaces, export
npx nx g @nx/nest:service packages/api/<lib>/src/lib/<feature>/<name> --dry-run
```

Delete the generated files you don't need. **Synced data (lists, items, includes, runs) never
gets REST CRUD endpoints.** It changes through mutation handlers (see below).

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
(sign-in, user administration, spaces, export). Mutations and socket messages are validated
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
  interface they implement lives in the shared contracts library.
- **Update DTOs:** use `PartialType` from `@nestjs/mapped-types`.
- **Path params:** `@Param('id', ParseUUIDPipe)`, or the right `Parse*Pipe`.

## Synced data: mutation handlers

Lists, items, includes and runs change only through the Socket.IO sync gateway
(`docs/design.md` §4.2). A handler:

1. **Authorizes:** the user is a member of the mutation's space.
2. **Validates:** with the Zod schema from `@lister/shared/sync-protocol`, plus the domain rules
   from `@lister/shared/domain` (for example `wouldCreateCycle`).
3. **Applies** the per-field patch, sets `updatedBy`, and stamps every changed row with the
   space's next version.
4. **Answers** with an ack carrying the version, or a rejection with a human-readable reason
   (users see it).

Rules:

- **One transaction:** all of it happens in **one synchronous `better-sqlite3` transaction**,
  with no `await` inside. That's what keeps mutations strictly ordered.
- **Idempotent:** mutations set values; they never toggle or increment. Creates use the
  client's id. A repeated mutation id returns the stored result.
- **Delete wins:** updates to a tombstoned row are ignored.
- **Not built yet:** the infrastructure arrives with T-006 and T-007. Once it exists, follow its
  handlers.

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
- **Logging:** in production, structured logs (`new ConsoleLogger({ json: true })`) with no
  secrets in them.

## Persistence

- **Database:** SQLite through Drizzle ORM 0.45 and `better-sqlite3` 13, in
  `packages/api/data-access-db` (from T-004). Connection pragmas: WAL, `foreign_keys=ON`,
  `busy_timeout`, `synchronous=NORMAL`.
- **Schema changes:**
  - Edit the Drizzle schema and generate a migration with drizzle-kit. Migrations are committed
    and applied on startup.
  - Bump the Dexie schema version on the client in the same change.
- **Synced tables** carry `id` (a client UUIDv7), `space_id`, `version`, `deleted_at`,
  `created_by`, `updated_by` and timestamps (`docs/design.md` §3). Synced rows are never
  hard-deleted, except by the tombstone purge job.
- **Tests:** use a fresh, migrated in-memory database (`:memory:`).
- **No other stack:** don't introduce another database or ORM.

## Tests

What's required is in the `testing` skill. For the API:

- **Unit:** `npx nx test lister-api`, or the library's project name (Vitest with
  `@nestjs/testing`). Build a testing module with the class under test and mocked collaborators
  (`{ provide: X, useValue: mock }`), or a fresh in-memory database when the logic is SQL.
- **Integration (every route and socket event):**
  - Put them in `apps/lister-api/src/integration/<area>.integration.spec.ts`.
  - `createTestApp()` (from T-004) gives the real `AppModule` with `main.ts`'s setup, a fresh
    in-memory database and a random port. Call it with `fetch`, or with `socket.io-client` for
    the gateway.
  - Cover the happy path and the failures: 400, 401, 403, 404 and 409 for HTTP; acks,
    rejections, retries, pokes and membership for sockets.
  - They run in `nx test lister-api`.
- **Smoke:** `npx nx e2e lister-api-e2e` (Vitest with axios) starts the built server and checks
  what needs the real process: startup, migrations, health, static hosting, and the origin check.
