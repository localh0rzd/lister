# @lister/web/util-notify

`Notifier.notify({ message, action?, duration? })` is the one way to show a snackbar. It
resolves with `'action'` or `'dismissed'`.

- Timed notices (with a `duration`, e.g. Undo) show in order. A newer one cuts the current one
  short once it has shown for 1.5 s (`MIN_NOTICE_MS`), so none is lost and the latest action's
  Undo arrives quickly.
- Sticky notices (no `duration`, e.g. "New version available") show when nothing else is
  waiting. They step aside for newer notices and come back until they're acted on or swiped away.
  A newer sticky notice replaces an older one at once.
