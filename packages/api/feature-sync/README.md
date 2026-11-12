# @lister/api/feature-sync

Synced data on the server (design §4.2).

- `MutationService.apply()` handles one pushed mutation in one synchronous SQLite transaction.
  It replays a known mutation id (same space only), validates the entry and checks the space.
  Then it runs the handler, raises the space version, stamps every changed row and records the
  answer. It returns the changed rows for the poke.
- `mutation-handlers.ts` has one handler per mutation. Changes are per-field patches; deletes
  win, including for the items of a deleted list (design §2.4); creates are idempotent by id.
  Handlers check everything before they write.
- `DevSeed`, `DEV_USER_ID` and `DEV_SPACE_ID` stand in for accounts until T-024/T-025. Accounts now exist (T-022),
  but the socket doesn't use them yet; rows stamped with `DEV_USER_ID` stay as they are (no
  foreign key on `created_by`/`updated_by`).
- `SyncGateway`: hello → welcome (or `updateRequired`), pull → rows since a version (0 means a
  snapshot), and push → ack or reject per mutation in order, plus a poke of the changed rows to
  the space's room. `SyncReader` does the reads.
- `SyncIoAdapter` (installed by `configureApp`) allows only the WebSocket transport, and only
  the origins from `allowedOrigins()`: `PUBLIC_URL`, plus the dev server outside production.
