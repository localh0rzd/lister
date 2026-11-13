---
name: fullstack-feature
description: Build a Lister feature that spans the API and the web app — either synced data (lists, items, includes, runs and anything else users edit together; local-first, changed through mutations over the sync engine) or a plain HTTP endpoint (sign-in, passkeys, user administration, spaces, export). Use when a change touches both apps/lister-api and apps/lister-web, adds a synced entity, field or mutation, or adds an HTTP endpoint the UI consumes.
---

# Full-stack feature

Always load `best-practices`, `testing` and `module-boundaries` too. A full-stack feature
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

### 1. Domain — `packages/shared/domain`

- Entity type in `src/lib/entities.ts` that `extends SyncMetadata`, as `List` and `Item` do
  (`id`, `spaceId`, `version`, `deletedAt`: `null` or a timestamp for a tombstone, `createdBy`,
  `updatedBy`, `createdAt`, `updatedAt`), plus its fields.
- Text limits in `src/lib/limits.ts` (`LIMITS`), ordering with `src/lib/positions.ts`
  (`sortByPosition`, `positionAtEnd`, `positionAt`, `positionBetween`, `moveTo`; fractional-indexing keys), ids with `newId()`
  (UUIDv7).
- Pure rules that both sides need (cycle check, flattening, merging) go here as functions with
  plain unit tests.

### 2. Protocol — `packages/shared/sync-protocol`

- **Field schemas** in `src/lib/common.ts` (`titleSchema`, `noteSchema`, `positionSchema`, …).
- **Row schema** in `src/lib/rows.ts`: `<entity>RowSchema = z.object({...syncMetadata, ...})
satisfies z.ZodType<Entity>`, tolerant (`z.object`, not `strictObject`): it's what the server
  sends. New table: add it to `rowSetSchema` as an array.
- **Mutations** in `src/lib/mutations.ts`: an entry in `mutationArgs` (strict:
  `z.strictObject`) named `<entity>.<verb>`, and a `mutationOf('<name>')` line in
  `mutationSchema`.
  - `create` carries the client's `id` (and the parent id, e.g. `listId`); `update` is
    `{ id, patch: patch({...}) }` (per field, at least one); `delete`/`restore` are `byId`;
    `move` sets a `position`.
  - Set values, never toggle or increment (`state: 'checked'`, not `toggle`).
  - Existing mutations change only additively; anything else bumps `PROTOCOL_VERSION`
    (`common.ts`), which makes old clients show "Update required".
- **Rules** in `src/lib/apply.ts`: a `case` in `applyMutation()`'s switch. It reads and writes
  only through the `RowStore`, checks everything before writing, and returns `changed` (with the
  row ids), `unchanged` (e.g. the row is a tombstone: delete wins) or `reject(reason)`. The
  reason is a sentence users see ("This list doesn't exist").
  - New table: `get<Entity>`/`put<Entity>` on `RowStore`; on `MemoryRowStore` a constructor
    argument and a public map (the engine reads `store.lists` / `store.items`); a key in
    `ApplyOutcome`'s `changed` arm.
  - A rule that reads by relation, not by id (e.g. "includes whose parent is X" for the cycle
    check), adds a query method to `RowStore`: `SqlRowStore` with an index on that column,
    `MemoryRowStore` by scan. On the client such a mutation needs every row of the relation in
    the store (step 4, `rebuild()`).
- **Tests:** `apply.spec.ts` (over `MemoryRowStore`: applies, retries are harmless, delete wins,
  rejections carry their reason, nothing is written on a rejection) and `mutations.spec.ts`
  (schema accepts/refuses).

### 3. Server — `packages/api/data-access-db`, `packages/api/feature-sync`

- **Table** (new table, or new column) in `packages/api/data-access-db/src/lib/schema.ts`, with
  `space_id` and `version` indexed like `lists`/`items`. Then generate and commit the migration:
  `npx nx run api-data-access-db:db-generate --name=<change>`. Migrations apply on startup
  (`openDatabase`); `createTestDatabase()` applies them to `:memory:`.
- **Store:** new table → `get`/`put` in `src/lib/sql-row-store.ts` (`SqlRowStore`, synchronous
  Drizzle calls on the transaction `tx`).
- **Rows out:** new table → read the changed ids in `MutationService.apply()`
  (`mutation.service.ts`, the `rows: RowSet` block) and the space's rows in
  `SyncReader.rowsSince()` (`sync-reader.ts`).
- There is **no per-mutation handler** to register: `MutationService.apply()` runs authorize
  (membership) → replay → parse (`parseMutation`) → `applyMutation()` →
  version + 1 → record, in one synchronous transaction (never `await` inside), and
  `SyncGateway` acks the sender and pokes the space's room.
- **Tests:** `mutation.service.spec.ts` (through the real service on `createTestDatabase()`), and
  `apps/lister-api/src/integration/sync.integration.spec.ts` for the socket: ack, poke to the
  others with the row, reject with the reason, pull returns the row (its `connect`/`next`/
  `collect` helpers).
- Test data: real accounts, as `sync.integration.spec.ts` arranges them (`createAccount`,
  `signIn`, a shared space through `POST /api/spaces`); sockets connect with the session cookie.
  The web e2e suite is signed in by `src/support/global-setup.ts`.

### 4. Client data — `packages/web/data-access-local-db`, `packages/web/data-access-sync`

- **Dexie** (`src/lib/local-db.ts`): every Drizzle migration comes with a new
  `this.version(n).stores({...})` in the same commit; say in the class comment which migration
  it matches. New table → **two** tables: the visible one (`<entities>`) and the server copy
  (`server<Entities>`), both indexed by `id, spaceId` plus the parent id.
  - **New synced table or field → snapshot.** Row schemas are tolerant, so a cached older app
    dropped the new table or field from every poke while still advancing its version; a plain
    pull after the update would never bring those rows back. The version that adds it clears the
    sync position, so the next pull is a full snapshot (the outbox survives):
    `this.version(n).stores({...}).upgrade((tx) => tx.table('syncState').clear())`. Test it in
    `local-db.spec.ts` (open the old version with data, then the new one: `syncState` is empty,
    `outbox` isn't).
- **Engine** (`src/lib/sync-engine.ts`), new table only — it names lists, items, includes, runs and
  run items explicitly, and nothing fails to compile if you miss a place (includes, T-015, are the
  example with references and a relation):
  - `mutate()`: load the new visible table into the `MemoryRowStore` it predicts with,
    otherwise the rule can't find the row and refuses the change locally;
  - `syncTables()`: both tables (so the rebuild runs in one transaction);
  - `storeServerRows()`: store `rows.<entities>` in the server table, clear it on a snapshot,
    and add the ids to `touched`;
  - `rebuild()`: load the server rows (all of the space, or by touched id) into the
    `MemoryRowStore` and write the visible rows back (`changes()`). The incremental path also
    loads rows the rules reach through references (each touched item's list, each touched
    include's parent and child lists); add the new table's. For a rule that reads by relation,
    load that whole relation (every include of the space, for the loop check; every item of each
    run concerned, for merging and finishing);
  - `touchedBy()`: map the new mutation prefix to its table (`list.`, `item.`, `include.`) and
    read its reference arguments (a `case` per mutation family: `list`, `item`, `include`,
    `run`, `runItem`); an unknown family touches nothing;
  - its spec (`sync-engine.spec.ts`, fake socket + fake-indexeddb): local apply, ack, poke,
    reject rolls back, rebase.
- **Reads:** a method on `Repositories` (`src/lib/repositories.ts`) returning
  `liveQuerySignal(() => ...)`, i.e. `Signal<QueryState<T>>` (`status`: `loading` / `ready` / `error`; `valueOf()`).
  Leave out tombstones in the query (`deletedAt` can't be indexed while it's `null`), and sort
  here. Test it in `repositories.spec.ts`.

### 5. UI — the feature library (`angular-feature` skill)

- Read with `inject(Repositories)` and the current space (`inject(CurrentSpace).id`); render the
  `QueryState` (loading, error, empty, `no-space` before the first sync) the way
  `lists-page.ts` / `list-editor-page.ts` do.
- Change through `SpaceChanges` (`packages/web/feature-lists/src/lib/space-changes.ts`):
  `apply(change)` adds the space id, calls `SyncEngine.mutate()` and shows a refusal;
  `withUndo(change, message, undo)` is for destructive actions (`delete` → `restore`). Move it
  to a shared web library when a second feature needs it.
- Ids for new rows: `newId()`; positions: `positionAtEnd` / `positionBetween` / `moveTo` (with "Move up / down" as
  the keyboard alternative to drag and drop).
- Pending, offline and rejected states come from the engine (the sync badge in `web/ui`); the
  page doesn't track them itself.

### 6. E2E — `apps/lister-web-e2e`

- Use `support/app.ts`: `unique()`, `createList`, `openList`, `itemTitles`, `addItem`,
  `pasteItems`, `itemMenu`, `editItemTitle`, `otherDevice(browser)` (a second browser
  context), `syncStatus`, `synced(page)` (nothing left to sync), `shellIsCached` (before going
  offline in a `*.pwa.spec.ts`). Add helpers for the new feature there.
- A happy path at phone and desktop widths with `expectAccessible()` (`support/fixtures.ts`).
- Real time (`sync.spec.ts`): a change in A appears in B without a reload.
- Offline: `context.setOffline(true)` → change → `setOffline(false)` → `synced()` → both
  devices show the same content. Reload-while-offline specs are `*.pwa.spec.ts`
  (`sync.pwa.spec.ts`).
- In dialogs, wait for the initially focused field (`toBeFocused()`) before filling another
  one.

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
