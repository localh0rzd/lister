# Libraries: version notes

Read the part for the library you're touching.

Check the docs for the installed version when the task adds the library:

- **Zod 4 (`zod/mini` in shared schemas, for bundle size):**
  - `zod/mini` loads no locale: `sync-protocol` calls `z.config(en())` once, so default messages stay readable.
  - `zod/mini` has no method chains: write checks as `.check(z.maxLength(n, 'msg'), z.regex(re, 'msg'))`, wrappers as functions (`z.nullable(s)`, `z._default(s, v)`, `z.partial(s)`), and type schemas as `z.ZodMiniType<T>`.
  - Top-level formats: `z.uuid()`, `z.email()`, `z.iso.datetime()`.
  - `z.strictObject()` for messages, and the `error` option for error messages.
  - `z.infer` for types, and `safeParse` at every boundary.
- **Drizzle 0.45 with `better-sqlite3`:**
  - The schema lives in TypeScript.
  - drizzle-kit generates the migrations, and they're committed.
  - Transactions are synchronous, with no `await` inside.
- **Dexie 4:** a versioned schema (`db.version(n).stores(...)`), typed tables, and `liveQuery`
  turned into signals.
- **Socket.IO 4:**
  - Typed events on both sides (`Server<ClientToServerEvents, ServerToClientEvents>`).
  - Acknowledgements with a timeout: `socket.timeout(ms).emitWithAck(...)`.
  - WebSocket transport only.
