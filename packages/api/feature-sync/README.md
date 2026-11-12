# @lister/api/feature-sync

Synced data on the server (design §4.2).

- `MutationService.apply()` handles one pushed mutation in one synchronous SQLite transaction.
  It replays a known mutation id (same space only), validates the entry and checks the space.
  Then it runs the handler, raises the space version, stamps every changed row and records the
  answer. It returns the changed rows for the poke.
- `mutation-handlers.ts` has one handler per mutation. Changes are per-field patches; deletes
  win, including for the items of a deleted list (design §2.4); creates are idempotent by id.
  Handlers check everything before they write.
- `DevSeed`, `DEV_USER_ID` and `DEV_SPACE_ID` stand in for accounts until T-024 (there is no user
  row).
- The Socket.IO gateway arrives with T-007.
