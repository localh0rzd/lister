---
name: fullstack-feature
description: Build a Lister feature that spans the API and the web app — either synced data (lists, items, includes, runs and anything else users edit together; local-first, changed through mutations over the sync engine) or a plain HTTP endpoint (sign-in, passkeys, user administration, spaces, export). Use when a change touches both apps/lister-api and apps/lister-web, adds a synced entity, field or mutation, or adds an HTTP endpoint the UI consumes.
---

# Full-stack feature

First decide which kind of data it is:

- **Synced data**: anything users edit or check off together. That means lists, items, includes, runs and run items, and anything new of that kind. It must work offline. → **Path A**.
- **Request/response**: sign-in, passkeys, user administration, spaces and memberships, export, health. These need the server and don't work offline. → **Path B**.

When unsure, read `docs/design.md` §2.5 and §4.2. Never build synced data on REST CRUD, not even as a stopgap.

> The sync infrastructure (database layer, `domain` and `sync-protocol` libraries, gateway, local database, sync engine) is built by T-004 – T-014. Until T-014 is done, Path A describes the target design. T-014 replaces it with the real files, APIs and commands.

## Path A — synced data

Work in this order; each step compiles against the previous one.

1. **Domain** (`packages/shared/domain`): add or extend the entity type, including the sync metadata (`id`, `spaceId`, `version`, `deletedAt`, `createdBy`, `updatedBy`, timestamps). Pure rules (ordering, flattening, cycle checks, checks that need other rows) go here as functions with unit tests.
2. **Mutations** (`packages/shared/sync-protocol`): one Zod schema per mutation, e.g. `item.update { id, patch: { title?, quantity?, note? } }`. Rules:
   - Set values, never toggle or increment (`state: 'checked'`, not `toggle`), so retries are harmless.
   - New rows get their id from the client (UUIDv7).
   - Change existing mutations only additively; anything else needs a protocol version bump.
3. **Server**:
   - Drizzle table plus a generated migration in `packages/api/data-access-db`.
   - Mutation handler in the sync feature, following the `nest-feature` skill: authorize (space membership) → validate (schema and domain rules) → apply → stamp `version` and `updatedBy`. Synchronous, inside the transaction, no `await`.
   - Reject with a human-readable reason when a rule is broken ("would create a loop"); users see it.
   - Integration test on in-memory SQLite: the mutation applies, a retry is idempotent, delete wins, a rejection carries its reason.
4. **Client**:
   - Dexie table or index plus a **new Dexie schema version** in `packages/web/data-access-local-db`. It must match the Drizzle change.
   - Local apply for the mutation, using the same domain rules as the server.
   - A repository query, exposed as a signal, for the UI.
5. **UI** (following the `angular-feature` skill): components read repository signals and call mutations through the sync engine. Handle empty, offline ("not synced yet") and rejected states, and offer Undo (the inverse mutation) for destructive actions.
6. **E2E**:
   - a spec with two browser contexts: a change in A appears in B without a reload;
   - for anything used offline, an offline spec: `context.setOffline(true)` → change → back online → both converge.

## Path B — request/response over HTTP

1. **Contract** (`packages/shared/api-contracts`): interfaces for the request and response; URLs via `apiPath(...)`. Dates are ISO strings.
2. **API**: Nest controller and service. The request body is a DTO class that `implements` the contract interface and carries `class-validator` decorators. Errors are Nest HTTP exceptions. Unit-test the service and add a case to `apps/lister-api-e2e`.
3. **Web**: `httpResource()` for reads, `HttpClient` in a data-access service for writes, typed with the contract. Handle loading, error and empty states.

## Checklist

- [ ] Right path chosen (synced vs. request/response)
- [ ] Shared types and schemas exported; no web ↔ api imports (lint enforces this)
- [ ] Path A: the Drizzle migration and the Dexie version bump match
- [ ] Rejected and offline states are visible in the UI
- [ ] Tests on both sides; e2e for user-visible behaviour
- [ ] `verify` passes
