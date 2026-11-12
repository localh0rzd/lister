# @lister/shared/sync-protocol

The sync protocol between the web app's sync engine and the API's Socket.IO gateway (design
§4.2), as Zod 4 schemas with inferred types.

- `PROTOCOL_VERSION`: bump it on any change that isn't purely additive.
- `mutationSchema`: a discriminated union on `name` (`list.create`, `item.update`, …).
  Mutations set values and never toggle; creates carry the client's id. Add a mutation by adding
  its args to `mutationArgs` and its line to the union.
- Messages: `hello`, `pull` and `push` (client → server); `welcome`, `updateRequired`, `rows`,
  `ack`, `reject` and `poke` (server → client). `ClientToServerEvents` and
  `ServerToClientEvents` type the Socket.IO events on both sides.
- Row schemas (`listRowSchema`, `itemRowSchema`, `rowSetSchema`) check what the server sends.
