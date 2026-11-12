import AxeBuilder from '@axe-core/playwright';
import { test as base, expect } from '@playwright/test';

/**
 * `expectAccessible()` runs an axe check (WCAG 2.1 A and AA) on the current page and fails with
 * the violations listed. Happy-path specs call it on every screen they visit (`testing` skill).
 */
export const test = base.extend<{ expectAccessible: () => Promise<void> }>({
  expectAccessible: async ({ page }, use) => {
    await use(async () => {
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(
        violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`),
      ).toEqual([]);
    });
  },
});

export { expect };
