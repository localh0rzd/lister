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
 * `expectAccessible()` runs an axe check (WCAG 2.1 A and AA) on the current page and fails with
 * the violations listed. Happy-path specs call it on every screen they visit (`testing` skill).
 */
export const test = base.extend<{
  expectAccessible: (other?: Page) => Promise<void>;
}>({
  expectAccessible: async ({ page }, use) => {
    // A page the test opened itself (e.g. in a signed-out context) can be passed in.
    await use(async (other = page) => {
      await settleAnimations(other);
      const { violations } = await new AxeBuilder({ page: other })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(
        violations.map(
          (v) =>
            `${v.id}: ${v.help} (${v.nodes.length}): ${v.nodes.map((n) => n.html.slice(0, 160)).join(' | ')}`,
        ),
      ).toEqual([]);
    });
  },
});

export { expect };
