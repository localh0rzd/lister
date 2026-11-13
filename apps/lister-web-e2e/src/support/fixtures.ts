import AxeBuilder from '@axe-core/playwright';
import { type Page, test as base, expect } from '@playwright/test';

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
