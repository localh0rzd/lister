# @lister/web/data-access-local-db

The web app's local database (IndexedDB via Dexie 4) and the queries the UI reads from.

- `LocalDb`: tables `spaces`, `lists`, `items` (server rows, tombstones included), `outbox`
  (pending mutations, in order), `syncState` (last synced version per space) and `meta`. **Every
  server migration gets a new `this.version(n)` here in the same change.**
- `LOCAL_DB`: the injection token; tests provide `new LocalDb(uniqueName)`, with
  `fake-indexeddb` loaded in `src/test-setup.ts`.
- `liveQuerySignal(source)`: a Dexie `liveQuery` as an Angular signal. It's `undefined` until
  loaded and re-queries when the signals `source` reads change.
- `Repositories`: `listsOfSpace` (by title) and `itemsOfList` (by position), without deleted
  rows.

The UI only reads here. Changes go through the sync engine (`@lister/web/data-access-sync`).
