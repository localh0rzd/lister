# @lister/api/feature-spaces

Spaces and memberships (design D14) over REST: list, create, rename and delete spaces; add and
remove members; leave. The `spaces` and `memberships` tables are in `@lister/api/data-access-db`.

- Personal spaces are created and deleted with their user (`AuthService`, `UsersService`), and
  can't be shared, left or deleted here.
- A caller who isn't a member gets 404 for a space; a member who isn't the owner gets 403 on
  owner-only routes. The owner can't leave or be removed (409): delete the space instead.
- The sync socket doesn't use memberships yet (T-025).
