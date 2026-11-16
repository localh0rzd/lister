import AxeBuilder from '@axe-core/playwright';
import { type Page, test as base, expect } from '@playwright/test';

/**
 * Waits until no finite CSS animation or transition is running (dialog enter, form-field label
 * float), since axe's `color-contrast` reads half-faded colours mid-animation. Endless
 * animations (spinners) are ignored.
 */
async function settleAnimations(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let round = 0; round < 20; round++) {
      const running = document
        .getAnimations()
        .filter(
          (a) =>
            a.playState === 'running' &&
            a.effect?.getComputedTiming().iterations !== Infinity,
        );
      if (running.length === 0) return;
      await Promise.allSettled(running.map((a) => a.finished));
    }
  });
  // One frame so styles computed from the final animation state are applied.
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => r())),
  );
}

/**
 * The visible icons that the icon font can't draw. A name the subset font
 * (`npx nx run lister-web:subset-icons`) lacks lays out as plain letters, far wider than one
 * glyph, so this is a net for icons the subset scanner can't see.
 */
async function iconsNotDrawn(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.querySelectorAll('mat-icon')]
      .filter((icon) => icon.checkVisibility())
      .filter((icon) => {
        const range = document.createRange();
        range.selectNodeContents(icon);
        const size = parseFloat(getComputedStyle(icon).fontSize);
        return range.getBoundingClientRect().width > size * 1.2;
      })
      .map((icon) => icon.textContent?.trim() ?? '');
  });
}

/** How often `expectAccessible` checks at most while animations keep starting during a check. */
const MAX_AXE_RUNS = 3;

type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>;

/**
 * Starts noting whether a CSS animation or transition starts on the page. The returned function
 * stops watching and says whether one did.
 */
async function watchAnimations(page: Page): Promise<() => Promise<boolean>> {
  const watch = await page.evaluateHandle(() => {
    const state = { started: false, stop: () => undefined as void };
    const note = () => (state.started = true);
    const events = ['animationstart', 'transitionrun'] as const;
    for (const e of events) document.addEventListener(e, note, true);
    state.stop = () => {
      for (const e of events) document.removeEventListener(e, note, true);
    };
    return state;
  });
  return async () => {
    const started = await watch.evaluate((state) => {
      state.stop();
      return state.started;
    });
    await watch.dispose();
    return started;
  };
}

/**
 * `expectAccessible()` runs an axe check (WCAG 2.1 A and AA) on the current page and fails with
 * the violations listed, and with any visible icon that the icon font can't draw. Happy-path
 * specs call it on every screen they visit (`testing` skill).
 */
export const test = base.extend<{
  expectAccessible: (other?: Page) => Promise<void>;
}>({
  expectAccessible: async ({ page }, use) => {
    // A page the test opened itself (e.g. in a signed-out context) can be passed in.
    await use(async (other = page) => {
      let violations: AxeResults['violations'] = [];
      // Something can start animating while axe runs (a snackbar's timed dismissal, the next
      // queued notice): then settle and check again. A real violation shows on every run.
      for (let run = 1; run <= MAX_AXE_RUNS; run++) {
        await settleAnimations(other);
        const animated = await watchAnimations(other);
        ({ violations } = await new AxeBuilder({ page: other })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze());
        if (!(await animated())) break;
      }
      // Plus any visible icon the subset font lacks (run `npx nx run lister-web:subset-icons`).
      const iconsMissingFromFont = await iconsNotDrawn(other);
      expect({
        violations: violations.map(
          (v) =>
            `${v.id}: ${v.help} (${v.nodes.length}): ${v.nodes.map((n) => n.html.slice(0, 160)).join(' | ')}`,
        ),
        iconsMissingFromFont,
      }).toEqual({ violations: [], iconsMissingFromFont: [] });
    });
  },
});

export { expect };
