import { TestBed } from '@angular/core/testing';
import { THEME_STORAGE_KEY, THEME_SURFACE, Theme } from './theme';

/** A controllable stand-in for `matchMedia('(prefers-color-scheme: dark)')`. */
function fakeSystemScheme(dark: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const query = {
    matches: dark,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_: string, l: (event: MediaQueryListEvent) => void) =>
      listeners.add(l),
    removeEventListener: (_: string, l: (event: MediaQueryListEvent) => void) =>
      listeners.delete(l),
  };
  window.matchMedia = vi.fn(() => query as unknown as MediaQueryList);
  return {
    change(nowDark: boolean) {
      query.matches = nowDark;
      for (const l of listeners) l({ matches: nowDark } as MediaQueryListEvent);
    },
    listenerCount: () => listeners.size,
  };
}

function addThemeColorMetas() {
  for (const scheme of ['light', 'dark'] as const) {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.media = `(prefers-color-scheme: ${scheme})`;
    meta.content = THEME_SURFACE[scheme];
    document.head.append(meta);
  }
}

const metaContents = () =>
  [
    ...document.head.querySelectorAll<HTMLMetaElement>(
      'meta[name="theme-color"]',
    ),
  ].map((m) => m.content);

function createTheme() {
  const theme = TestBed.inject(Theme);
  TestBed.tick();
  return theme;
}

describe('Theme', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['theme'];
    document.head
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((m) => m.remove());
    addThemeColorMetas();
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('follows the system scheme by default', () => {
    fakeSystemScheme(true);
    const theme = createTheme();

    expect(theme.preference()).toBe('system');
    expect(theme.scheme()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBeUndefined();
    expect(metaContents()).toEqual([THEME_SURFACE.light, THEME_SURFACE.dark]);
  });

  it('switches when the system scheme changes', () => {
    const system = fakeSystemScheme(false);
    const theme = createTheme();
    expect(theme.scheme()).toBe('light');

    system.change(true);

    expect(theme.scheme()).toBe('dark');
  });

  it('pins a manual choice, remembers it and updates the theme colour', () => {
    fakeSystemScheme(false);
    const theme = createTheme();

    theme.setPreference('dark');
    TestBed.tick();

    expect(theme.scheme()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(metaContents()).toEqual([THEME_SURFACE.dark, THEME_SURFACE.dark]);
  });

  it('goes back to the system scheme and forgets the choice', () => {
    fakeSystemScheme(false);
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    const theme = createTheme();

    theme.setPreference('system');
    TestBed.tick();

    expect(theme.scheme()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBeUndefined();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(metaContents()).toEqual([THEME_SURFACE.light, THEME_SURFACE.dark]);
  });

  it('starts with the remembered choice', () => {
    fakeSystemScheme(true);
    localStorage.setItem(THEME_STORAGE_KEY, 'light');

    const theme = createTheme();

    expect(theme.preference()).toBe('light');
    expect(theme.scheme()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it.each(['purple', ''])('ignores an unknown stored value (%j)', (stored) => {
    fakeSystemScheme(false);
    localStorage.setItem(THEME_STORAGE_KEY, stored);

    expect(createTheme().preference()).toBe('system');
  });

  it('still works when storage is blocked', () => {
    fakeSystemScheme(false);
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new DOMException('blocked', 'SecurityError');
      });
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('blocked', 'SecurityError');
      });
    onTestFinished(() => {
      getItem.mockRestore();
      setItem.mockRestore();
    });

    const theme = createTheme();
    expect(theme.preference()).toBe('system');

    theme.setPreference('dark');
    expect(theme.scheme()).toBe('dark');
  });

  it('stops listening to the system scheme when destroyed', () => {
    const system = fakeSystemScheme(false);
    createTheme();
    expect(system.listenerCount()).toBe(1);

    TestBed.resetTestingModule();

    expect(system.listenerCount()).toBe(0);
  });
});
