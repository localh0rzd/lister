---
name: nest-feature
description: Conventions and steps for NestJS work in lister-api — feature modules, controllers, services, DTO validation, errors, config and tests. Use when adding or changing anything in apps/lister-api or packages/api/*.
---

# NestJS feature work (lister-api)

## Generate, don't hand-roll

```bash
npx nx g @nx/nest:resource apps/lister-api/src/app/<feature>/<feature> --type=rest --crud --dry-run
npx nx g @nx/nest:service apps/lister-api/src/app/<feature>/<name> --dry-run
npx nx g @nx/nest:library packages/api/<feature> --tags=scope:api,type:feature --dry-run   # when a feature should be its own lib
```

The resource generator registers the module in `AppModule`. Delete generated files you don't need (e.g. `entities/` if there's no persistence yet).

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

A global `ValidationPipe({ whitelist: true, transform: true })` is registered in `main.ts`.

```ts
import { IsString, Length } from 'class-validator';
import type { CreateListRequest } from '@lister/shared/api-contracts';

export class CreateListDto implements CreateListRequest {
  @IsString()
  @Length(1, 120)
  title!: string;
}
```

- DTO classes live in the API (they use decorators); the interface they implement lives in the shared contracts lib.
- Use `PartialType` from `@nestjs/mapped-types` for update DTOs.
- Path params: `@Param('id', ParseUUIDPipe)` (or the right `Parse*Pipe`).

## Errors

- Throw built-in exceptions: `NotFoundException`, `BadRequestException`, `ConflictException`, …
- Don't catch-and-rewrap unless you add information. Cross-cutting error shaping goes in an exception filter.

## Config & secrets

- Read env vars (`process.env.X` or `@nestjs/config` once more than a couple exist). Defaults are for local dev only.
- No secrets, tokens or connection strings committed. Document new env vars in `README.md`.

## Persistence

No database is set up yet. Start with an in-memory service behind a clear interface. Adding a DB (e.g. Prisma or TypeORM) is its own task in `TASKS.md` — don't introduce one as a side effect.

## Tests

- Unit: `npx nx test lister-api` (Vitest + `@nestjs/testing`). Build a testing module with the class under test and mocked collaborators (`{ provide: X, useValue: mock }`).
- HTTP: `npx nx e2e lister-api-e2e` (Vitest) — starts the API, calls it with axios (base URL preconfigured). Add a spec per new route, covering the happy path and a validation failure (expect 400).
