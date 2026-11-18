---
name: fullstack-feature
description: Build a Lister feature that spans the API and the web app — either synced data (lists, items, includes, runs and anything else users edit together; local-first, changed through mutations over the sync engine) or a plain HTTP endpoint (sign-in, passkeys, user administration, spaces; export is client-side, D24). Use when a change touches both apps/lister-api and apps/lister-web, adds a synced entity, field or mutation, or adds an HTTP endpoint the UI consumes.
---

# Full-stack feature

Always load `best-practices` and `testing` too, and `module-boundaries` when you create a library or add an import from another project. A full-stack feature
usually means a web feature library (`packages/web/feature-<x>`) plus the shared types and
schemas in `packages/shared/*`. On the API side, a Path B feature gets its own
`packages/api/feature-<x>`; a Path A feature has no server code of its own beyond the table:
its rules live in `sync-protocol` and run inside `feature-sync`.

First decide which kind of data it is:

- **Synced data:** anything users edit or check off together. That means lists, items,
  includes, runs and run items, and anything new of that kind. It must work offline. →
  **Path A**.
- **Request/response:** sign-in, passkeys, user administration, spaces and memberships, export,
  health. These need the server and don't work offline. → **Path B**.

When unsure, read `docs/design.md` §2.5 and §4.2. Never build synced data on REST CRUD, not even
as a stopgap.

## Path A — synced data

Lists and items (T-006 – T-013) are the worked example: copy them. Work in this order; each
step compiles against the previous one. "New table" steps apply only when you add an entity; a
new field or mutation on an existing one skips them.

How it fits together: the client applies a mutation to its local rows at once and queues it; the
server applies the **same** rules (`applyMutation()` in `sync-protocol`) in a SQLite
transaction, bumps the space's version and pokes the changed rows to every client in the space.
The client keeps the server's copy separately and shows "server rows + pending mutations", so
a rejection rolls back and a poke rebases (design §4.2).

The steps, file by file — domain, protocol (`applyMutation()`), server table and store, Dexie
and the sync engine, UI through `SpaceChanges`, e2e — are in [path-a.md](path-a.md). Read it
before writing Path A code; for a new table, every step applies.

## Path B — request/response over HTTP

1. **Contract** (`packages/shared/api-contracts`): interfaces for the request and the response,
   types only (no Zod: it lands in the web main bundle, over budget).
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
- [ ] Path A: the Drizzle migration and the Dexie version bump match; a new synced table or
      field clears `syncState` in that Dexie version (next pull is a snapshot)
- [ ] Path A, new table: added everywhere lists and items are named (`rowSetSchema`, `RowStore`
      and `MemoryRowStore` (constructor, map), `ApplyOutcome`, `SqlRowStore`, `MutationService`
      rows, `SyncReader.rowsSince`, both Dexie tables, the engine's `mutate` / `syncTables` /
      `storeServerRows` / `rebuild` (incl. referenced rows) / `touchedBy`) and the fake server
      in `sync-engine.spec.ts`
- [ ] Rejected and offline states are visible in the UI
- [ ] Unit tests on both sides, integration tests for every backend call, a Playwright happy path
      (`testing` skill)
- [ ] `verify` passes
