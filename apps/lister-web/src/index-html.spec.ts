import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { THEME_STORAGE_KEY, THEME_SURFACE } from '@lister/web/util-theme';

// index.html must agree with @lister/web/util-theme: the inline script pins a remembered choice
// before the app (and its stylesheet) loads, so the first paint is never the wrong scheme.
const html = readFileSync(
  join(process.cwd(), 'apps/lister-web/src/index.html'),
  'utf8',
);

function loadPage(stored: Storage['getItem']) {
  const page = new DOMParser().parseFromString(html, 'text/html');
  const inlineScripts = [...page.querySelectorAll('script:not([src])')];
  const storage = { getItem: stored } as Storage;
  for (const script of inlineScripts) {
    new Function('document', 'localStorage', script.textContent ?? '')(
      page,
      storage,
    );
  }
  const themeColors = [
    ...page.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'),
  ].map((meta) => [meta.getAttribute('media'), meta.content]);
  return { colorScheme: page.documentElement.style.colorScheme, themeColors };
}

describe('index.html', () => {
  it('declares the theme colours per system scheme', () => {
    expect(loadPage(() => null)).toEqual({
      colorScheme: '',
      themeColors: [
        ['(prefers-color-scheme: light)', THEME_SURFACE.light],
        ['(prefers-color-scheme: dark)', THEME_SURFACE.dark],
      ],
    });
  });

  it.each(['light', 'dark'] as const)(
    'pins a remembered %s choice before the app starts',
    (scheme) => {
      const page = loadPage((key) =>
        key === THEME_STORAGE_KEY ? scheme : null,
      );

      expect(page.colorScheme).toBe(scheme);
      expect(page.themeColors.map(([, color]) => color)).toEqual([
        THEME_SURFACE[scheme],
        THEME_SURFACE[scheme],
      ]);
    },
  );

  it('ignores unknown values and blocked storage', () => {
    expect(loadPage(() => 'purple').colorScheme).toBe('');
    expect(
      loadPage(() => {
        throw new DOMException('blocked', 'SecurityError');
      }).colorScheme,
    ).toBe('');
  });
});
