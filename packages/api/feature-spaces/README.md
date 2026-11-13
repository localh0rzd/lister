# @lister/api/feature-spaces

Spaces and memberships (design D14) over REST: list, create, rename and delete spaces; add and
remove members; leave. The `spaces` and `memberships` tables are in `@lister/api/data-access-db`.

- Personal spaces are created and deleted with their user (`AuthService`, `UsersService`), and
  can't be shared, left or deleted here.
- A caller who isn't a member gets 404 for a space; a member who isn't the owner gets 403 on
  owner-only routes. The owner can't leave or be removed (409): delete the space instead.
- The sync socket uses memberships (T-025): after every change that touches memberships or the name
  of a space (create, rename, delete, add, remove, leave), `SpacesService` calls
  `SyncGateway.membershipsChanged()` (from `@lister/api/feature-sync`) with the affected users, so
  their connected clients leave the room and get a fresh welcome at once.
