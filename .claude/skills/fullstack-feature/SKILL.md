---
name: fullstack-feature
description: Build a Lister feature that spans the API and the web app — either synced data (lists, items, includes, runs and anything else users edit together; local-first, changed through mutations over the sync engine) or a plain HTTP endpoint (sign-in, passkeys, user administration, spaces, export). Use when a change touches both apps/lister-api and apps/lister-web, adds a synced entity, field or mutation, or adds an HTTP endpoint the UI consumes.
---

# Full-stack feature

Always load `best-practices`, `testing` and `module-boundaries` too. A full-stack feature
usually means a feature library on each side (`packages/web/feature-<x>`,
`packages/api/feature-<x>`), plus the shared types and schemas in `packages/shared/*`.

First decide which kind of data it is:

- **Synced data:** anything users edit or check off together. That means lists, items,
  includes, runs and run items, and anything new of that kind. It must work offline. →
  **Path A**.
- **Request/response:** sign-in, passkeys, user administration, spaces and memberships, export,
  health. These need the server and don't work offline. → **Path B**.

When unsure, read `docs/design.md` §2.5 and §4.2. Never build synced data on REST CRUD, not even
as a stopgap.

> T-004 – T-014 build the sync infrastructure: the database layer, the `domain` and
> `sync-protocol` libraries, the gateway, the local database and the sync engine. Until T-014 is
> done, Path A describes the target design. T-014 replaces it with the real files, APIs and
> commands.

## Path A — synced data

Work in this order; each step compiles against the previous one.

1. **Domain** (`packages/shared/domain`):
   - Add or extend the entity type, including the sync metadata: `id`, `spaceId`, `version`,
     `deletedAt`, `createdBy`, `updatedBy` and timestamps.
   - Pure rules go here as functions with unit tests: ordering, flattening, cycle checks, and
     checks that need other rows.
2. **Mutations** (`packages/shared/sync-protocol`): one Zod schema per mutation, for example
   `item.update { id, patch: { title?, quantity?, note? } }`. Rules:
   - Set values, never toggle or increment (`state: 'checked'`, not `toggle`), so retries are
     harmless.
   - New rows get their id from the client (UUIDv7).
   - Change existing mutations only additively; anything else needs a protocol version bump.
3. **Server:**
   - A Drizzle table plus a generated migration in `packages/api/data-access-db`.
   - A mutation handler in the sync feature, following the `nest-feature` skill: authorize
     (space membership) → validate (schema and domain rules) → apply → stamp `version` and
     `updatedBy`. Synchronous, inside the transaction, with no `await`.
   - When a rule is broken, reject with a human-readable reason ("would create a loop"). Users
     see it.
   - Handler tests on a fresh in-memory database: the mutation applies, a retry is idempotent,
     delete wins, and a rejection carries its reason.
   - An integration test through the socket (`testing` skill): ack, poke to the other members
     only, rejection.
4. **Client:**
   - A Dexie table or index, plus a **new Dexie schema version**, in
     `packages/web/data-access-local-db`. It must match the Drizzle change.
   - The local apply for the mutation, using the same domain rules as the server.
   - A repository query, exposed as a signal, for the UI.
5. **UI** (following the `angular-feature` skill, in the feature library):
   - Components read repository signals and call mutations through the sync engine.
   - Handle the empty, offline ("not synced yet") and rejected states.
   - Offer Undo (the inverse mutation) for destructive actions.
6. **E2E:**
   - a Playwright happy path for the feature;
   - a spec with two browser contexts: a change in A appears in B without a reload;
   - for anything used offline, an offline spec: `context.setOffline(true)` → change → back
     online → both converge.

## Path B — request/response over HTTP

1. **Contract** (`packages/shared/api-contracts`): interfaces for the request and the response.
   URLs are built with `apiPath(...)`, and dates are ISO strings.
2. **API:**
   - A Nest controller and service in the api feature library.
   - The request body is a DTO class that `implements` the contract interface and carries
     `class-validator` decorators. Errors are Nest HTTP exceptions.
   - Unit-test the service.
   - Add an integration test for every route in `apps/lister-api/src/integration/`: the happy
     path plus 400, 401, 403, 404 and 409 where they apply.
3. **Web:**
   - `httpResource()` for reads, and a `@Service()` class with `HttpClient` for writes, typed
     with the contract.
   - Handle the loading, error and empty states. Unit-test the components and the service.
   - Add a Playwright happy path for the flow.

## Checklist

- [ ] Right path chosen (synced or request/response)
- [ ] Bigger parts live in their own libraries with the right tags; the apps only wire them in
- [ ] Shared types and schemas are exported; no web ↔ api imports (lint enforces this)
- [ ] Path A: the Drizzle migration and the Dexie version bump match
- [ ] Rejected and offline states are visible in the UI
- [ ] Unit tests on both sides, integration tests for every backend call, a Playwright happy path
      (`testing` skill)
- [ ] `verify` passes
