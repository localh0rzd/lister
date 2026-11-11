---
name: nest-feature
description: Conventions and steps for NestJS work in lister-api — feature modules, controllers, services, DTO validation, errors, config and tests. Use when adding or changing anything in apps/lister-api or packages/api/*.
---

# NestJS feature work (lister-api)

## Generate, don't hand-roll

```bash
npx nx g @nx/nest:resource apps/lister-api/src/app/<feature>/<feature> --type=rest --crud --dry-run   # REST only: auth, passkeys, users, spaces, export
npx nx g @nx/nest:service apps/lister-api/src/app/<feature>/<name> --dry-run
npx nx g @nx/nest:library packages/api/<name> --tags=scope:api,type:feature --dry-run   # planned libs: docs/design.md §5
```

The resource generator registers the module in `AppModule`; delete generated files you don't need. **Synced data (lists, items, includes, runs) never gets REST CRUD endpoints**: it changes through mutation handlers (see below).

## Structure

```
app/<feature>/
  <feature>.module.ts       imports/providers/exports for the feature
  <feature>.controller.ts   HTTP only: params, DTOs, status codes
  <feature>.service.ts      business logic, injectable, unit-tested
  dto/create-<x>.dto.ts     validated request classes
```

- All routes are under the global prefix `api` (`API_PREFIX` from `@lister/shared/api-contracts`).
- Controller method return types are the **shared contract interfaces**, so the response shape is compiler-checked.

## DTOs & validation

A global `ValidationPipe({ whitelist: true, transform: true })` is registered in `main.ts`. It covers REST request bodies (sign-in, user administration, spaces, export). Mutations are validated with the shared Zod schemas instead.

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

- DTO classes live in the API (they use decorators); the interface they implement lives in the shared contracts lib.
- Use `PartialType` from `@nestjs/mapped-types` for update DTOs.
- Path params: `@Param('id', ParseUUIDPipe)` (or the right `Parse*Pipe`).

## Synced data: mutation handlers

Lists, items, includes and runs change only through the Socket.IO sync gateway (`docs/design.md` §4.2). A handler:

1. **Authorizes:** the user is a member of the mutation's space.
2. **Validates:** with the Zod schema from `@lister/shared/sync-protocol`, plus the domain rules from `@lister/shared/domain` (e.g. `wouldCreateCycle`).
3. **Applies** the per-field patch, sets `updatedBy`, and stamps every changed row with the space's next version.
4. **Answers** with an ack carrying the version, or a rejection with a human-readable reason (users see it).

Rules:

- All of it happens in **one synchronous `better-sqlite3` transaction**, with no `await` inside. That's what keeps mutations strictly ordered.
- Mutations set values; they never toggle or increment. Creates use the client's id. A repeated mutation id returns the stored result.
- Updates to a tombstoned row are ignored (delete wins).
- The infrastructure arrives with T-006 and T-007. Once it exists, follow its handlers.

## Errors

- Throw built-in exceptions: `NotFoundException`, `BadRequestException`, `ConflictException`, …
- Don't catch-and-rewrap unless you add information. Cross-cutting error shaping goes in an exception filter.

## Config & secrets

- Read env vars (`process.env.X` or `@nestjs/config` once more than a couple exist). Defaults are for local dev only.
- No secrets, tokens or connection strings committed. Document new env vars in `README.md`.

## Persistence

- SQLite via Drizzle ORM 0.45 and `better-sqlite3` 13, in `packages/api/data-access-db` (from T-004). Connection pragmas: WAL, `foreign_keys=ON`, `busy_timeout`, `synchronous=NORMAL`.
- Schema changes: edit the Drizzle schema and generate a migration with drizzle-kit (committed, applied on startup). Bump the Dexie schema version on the client in the same change.
- Synced tables carry `id` (client UUIDv7), `space_id`, `version`, `deleted_at`, `created_by`, `updated_by` and timestamps (`docs/design.md` §3). Synced rows are never hard-deleted outside the tombstone purge job.
- Tests use a fresh, migrated in-memory database (`:memory:`).
- Don't introduce another database or ORM.

## Tests

- Unit: `npx nx test lister-api` (Vitest + `@nestjs/testing`). Build a testing module with the class under test and mocked collaborators (`{ provide: X, useValue: mock }`).
- HTTP: `npx nx e2e lister-api-e2e` (Vitest) — starts the API, calls it with axios (base URL preconfigured). Add a spec per new route, covering the happy path and a validation failure (expect 400).
- Sync: API e2e with `socket.io-client` for gateway behaviour (two clients, reconnects, retried mutations, rejections).
