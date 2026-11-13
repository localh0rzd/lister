# @lister/api/feature-sync

Synced data on the server (design §4.2).

- `MutationService.apply()` handles one pushed mutation in one synchronous SQLite transaction.
  It checks the sender's membership first (non-members get "You can't change this space" and
  nothing is recorded), then replays a known mutation id (same space only) and validates the entry.
  Then it runs the handler, raises the space version, stamps every changed row and records the
  answer. It returns the changed rows for the poke.
- `mutation-handlers.ts` has one handler per mutation. Changes are per-field patches; deletes
  win, including for the items of a deleted list (design §2.4); creates are idempotent by id.
  Handlers check everything before they write.
- `SyncGateway`: hello → welcome with the user's spaces and their members (or `updateRequired`), pull → rows since a version (0 means a
  snapshot), and push → ack or reject per mutation in order, plus a poke of the changed rows to
  the space's room. `SyncReader` does the reads.
- `SyncIoAdapter` (installed by `configureApp`) allows only the WebSocket transport, only
  the origins from `allowedOrigins()` (`PUBLIC_URL`, plus the dev server outside production), and
  only connections with a live session cookie (`AuthService.authenticate`); the user lands in
  `socket.data`.
- Authorization is re-checked in the database on every pull and push (`SyncReader.isMember`,
  `AuthService.isSessionActive`); rooms are kept in step by `SyncGateway.membershipsChanged()`,
  which `feature-spaces` calls after every membership change.
