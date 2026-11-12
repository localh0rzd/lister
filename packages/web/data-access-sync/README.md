# @lister/web/data-access-sync

The client sync engine (design §4.2). `provideSync()` starts it at bootstrap.

- `SyncEngine.mutate({ spaceId, name, args })`: predicts the change with the shared rules
  (`applyMutation` from `@lister/shared/sync-protocol`), queues it in the outbox and updates the
  visible rows at once, also offline. It answers `{ ok: false, reason }` for a change the rules
  refuse.
- One tab holds the Web Lock and runs the socket (`hello` → `pull` per space → `push` the
  outbox in order). Pokes apply in version order, and a gap triggers a pull. An ack drops the
  mutation once its version has arrived. A reject rolls it back and lands in `errors`. Visible
  rows are always the server copy plus the pending mutations (rebase).
- After a server disconnect it reconnects with backoff (1 s, doubling, up to 30 s). After
  `updateRequired` it stops.
- Signals: `online`, `syncing`, `pendingCount`, `lastSyncedAt`, `errors`, `updateRequired`.
- Tests use a fake socket whose server applies the same shared rules
  (`sync-engine.spec.ts`).
