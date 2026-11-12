# @lister/web/util-notify

`Notifier.notify({ message, action?, duration? })` is the one way to show a snackbar. It
resolves with `'action'` or `'dismissed'`.

- Timed notices (with a `duration`, e.g. Undo) show one after another; none replaces another.
- Sticky notices (no `duration`, e.g. "New version available") show when nothing else is
  waiting. They step aside for newer notices and come back until they're acted on or swiped away.
