# @lister/shared/domain

Plain TypeScript used by the web app and the API alike (no Angular, Nest, Node or browser-only
APIs; lint enforces it).

- `entities.ts`: `Space`, `List`, `Item` and the `SyncMetadata` every synced row carries
  (design §3). Timestamps are epoch milliseconds.
- `ids.ts`: `newId()` (UUIDv7, created on the client) and `isId()`.
- `positions.ts`: fractional-index keys. Compare with `comparePositions`, which falls back to the
  id when keys tie; `positionBetween`, `positionAt` and `positionAtEnd` make new keys.
- `quantity.ts`: D6, where an empty quantity means 1.
- `limits.ts`: field lengths shared with the mutation schemas.

Rules that later tasks add (flattening, cycle checks, merging, finishing) go here as pure
functions with table-driven tests.
