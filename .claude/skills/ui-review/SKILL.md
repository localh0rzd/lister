---
name: ui-review
description: Hands-on UI/UX review of Lister's web app — look at the real screens at phone and desktop widths, in light and dark, and judge what users see and feel: flicker and jumps, layout that doesn't fit, missing feedback, confusing text, weak information, Material 3 consistency, touch and keyboard use. Reported in tmp/reviews/<task-id>-ui.md with screenshots. Use for every task that changes the web UI (the task-review session runs it too), or when the user asks for a UI or UX review.
---

# Reviewing the UI and UX

Tests prove the code does what it says. This review asks whether it **looks and feels right**
to someone using it. Use the real app in a browser, not the code alone. Judge what a careful
user would notice in a minute of clicking. The user found these by hand after earlier tasks;
catch this kind of thing before they do:

- a dragged row jumps back to its old place for a moment before it settles;
- the sync badge flashes "1 change not synced" for a split second on every edit;
- the Edit item dialog is so narrow that the quantity hint wraps and the next field covers it;
- the Lists page shows only a list's own items, not the total with included lists, nor how many
  lists it includes.

## Ground rules

- Same as `task-review`: read-only, findings with evidence, a concrete scenario and a fix.
- **Evidence is a screenshot** (or a short sequence of them) saved under
  `tmp/reviews/<task-id>-ui/`, plus the steps to get there. For flicker, record what you see
  frame by frame (see "Catching flicker").
- Judge against Material 3 and `docs/design.md` (§2.7 UI, D11 look), not personal taste.

## Setting up

- **The app:** `npm start` (http://localhost:4200, dev data in `data/lister.db`) or, if the
  user's dev server is running, the e2e servers: `npx nx run lister-api:serve-e2e` serves on
  port 3000 too, so don't run both; never stop a server you didn't start. For PWA and offline,
  `npm run start:prod` (port 3100).
- **The browser:** the built-in browser pane (`mcp__Claude_Browser__*`), or a Playwright
  script under `tmp/` for things the pane can't do (throttling, frame-by-frame screenshots).
- **Sizes and themes:** phone 375 × 812 and desktop 1280 × 800, in light and in dark.
- **Two devices** for anything synced: a second tab or browser context on the same list.
- Create your own data with unique titles; don't change lists you didn't create.

## Checklist

Walk every screen and flow the task touches, then the screens next to them.

### Feedback and motion

- **No flicker or jumps:**
  - After a drag, the row stays where it was dropped.
  - After an edit, nothing shows the old state again, even for one frame.
  - Lists don't reorder, collapse or scroll by themselves.
- **No flashing status:**
  - Indicators (sync badge, spinners, "Loading…") don't appear for changes that complete in
    milliseconds.
  - Anything shown briefly is either delayed or stays long enough to read.
- **Every action has a visible result:**
  - a change appears at once (local-first);
  - destructive actions offer Undo;
  - a refusal says why.
- **Transitions:** Material motion, no layout shift when content loads, and no element
  appearing under the pointer just before a click.

### Layout and fit

- **Text fits:**
  - Labels, hints, buttons and snackbars aren't cut off or covered by other elements.
  - Hints and errors have room under their field and push the next field down instead of
    overlapping it.
  - Long titles, long notes and long words wrap; nothing scrolls sideways at 375 px.
- **Dialogs:**
  - wide enough for their content on desktop, and no wider than the screen on a phone;
  - the first field is focused once it's ready;
  - the actions are reachable with the on-screen keyboard open.
- **Spacing and alignment** follow one rhythm (4/8 px grid); rows of the same kind look the
  same.
- **Touch:** targets of at least 48 × 48 px, with enough space between neighbouring actions.

### Information

- **The screen answers the obvious questions.** A list shows how much is in it, including
  included lists. A section says where its items come from. Sync state shows when it matters.
- **Empty, loading, error and offline states:**
  - each has helpful text and the next action;
  - none of them shows for a split second on a fast load.
- **Copy:**
  - short, plain English, the same words for the same thing (List, Item, Include, Run, Space);
  - numbers with the right plural;
  - no jargon (no "mutation", "rejected", "tombstone").

### Interaction

- **Keyboard:**
  - every action works without a mouse, in a sensible tab order;
  - the focus is visible, and after an action it lands somewhere sensible;
  - the focus is never pulled away while the user types.
- **Screen readers:** names on icon buttons, roles and labels on lists and sections, and live
  announcements for moves and sync state. Run axe as well (`expectAccessible` in the e2e
  fixtures), but don't stop at it.
- **Consistency:** the same action looks and sits the same everywhere (menus, FAB, Undo).
  Material 3 components and `--mat-sys-*` tokens are used, with no hard-coded colours.
- **Dark mode:** contrast, borders and placeholders hold up.

## Catching flicker

Flicker is often too fast to see in a screenshot. Check for it in at least one of these ways:

- **A Playwright probe:** a script under `tmp/` that, for example, records the order of the row
  titles on every animation frame through the action:

  ```ts
  await page.evaluate(() => {
    const w = window as unknown as { frames: string[] };
    w.frames = [];
    const tick = () => {
      w.frames.push(
        [...document.querySelectorAll('.item .title')]
          .map((t) => t.textContent)
          .join('|'),
      );
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  ```

  Then do the action (drag, edit, delete) and inspect the distinct consecutive states. More
  than "before → after" is a finding.

- **A watcher on the indicator:** a `MutationObserver` on the sync badge that logs every
  text change with a timestamp.
- **Slower devices:** CPU throttling (CDP `Emulation.setCPUThrottlingRate`, rate 4 to 6) makes
  short-lived states visible.

## Report

Write `tmp/reviews/<task-id>-ui.md`, or append a "UI/UX" section to the task's review when
`task-review` runs this skill:

```markdown
# UI/UX review of T-NNN — <title>

Verdict: Approve | Approve with minor fixes | Changes requested

## Findings

### 1. [major] <one-line summary>

<screen and size/theme> — what the user sees, why it matters, steps, screenshot path, fix.

## Checked and fine

<one line per flow and size you walked through>
```

Severity:

- **blocker:** the flow can't be completed, or the screen shows something wrong.
- **major:** flicker, overlap, cut-off text, missing feedback, focus theft or a keyboard trap.
- **minor:** spacing, wording or consistency.
- **nit:** polish.

Every finding becomes a fix with a test where one can catch it: a unit test for state logic,
an e2e check for layout (bounding boxes, `toBeFocused`, frame recordings).
