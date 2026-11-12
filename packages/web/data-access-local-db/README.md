# @lister/web/data-access-local-db

The web app's local database (IndexedDB via Dexie 4) and the queries the UI reads from.

- `LocalDb` (design §4.2):
  - `serverLists`, `serverItems`: rows as the server last sent them, tombstones included.
  - `lists`, `items`: what the UI shows, i.e. server rows with the pending outbox mutations
    re-applied. The sync engine rebuilds them for rebase and rollback.
  - `outbox`: pending mutations in order (`++seq`, unique `mutationId`, `spaceId`, `ackedVersion`).
  - `spaces` (with members), `syncState` (synced version per space), `meta`.
  - **Every server migration gets a new `this.version(n)` here in the same change.**
- `LOCAL_DB`: the injection token; tests provide `new LocalDb(uniqueName)`, with
  `fake-indexeddb` loaded in `src/test-setup.ts`.
- `liveQuerySignal(source)`: a Dexie `liveQuery` as a `Signal<QueryState<T>>` (`loading`,
  `ready` with the value, or `error`). It re-queries when the signals `source` reads change;
  `valueOf(state)` gives the value or `undefined`.
- `Repositories`: `listsOfSpace` (by title) and `itemsOfList` (by position), without deleted
  rows.

The UI only reads here. Changes go through the sync engine (`@lister/web/data-access-sync`).
