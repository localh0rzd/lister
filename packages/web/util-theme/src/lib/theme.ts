import {
  DOCUMENT,
  DestroyRef,
  type EnvironmentProviders,
  Service,
  computed,
  effect,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
  signal,
} from '@angular/core';

/** What the user picked. `system` follows the browser's colour scheme (D11). */
export type ThemePreference = 'system' | 'light' | 'dark';
export type ColorScheme = 'light' | 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = [
  'system',
  'light',
  'dark',
];

/**
 * localStorage key of the remembered choice. The inline script in
 * `apps/lister-web/src/index.html` reads the same key before Angular starts, so the page never
 * flashes in the wrong scheme.
 */
export const THEME_STORAGE_KEY = 'lister.theme';

/**
 * The M3 surface colours of the #00796B theme (neutral 98 and neutral 6 in
 * `apps/lister-web/src/_theme-colors.scss`), used for `<meta name="theme-color">`.
 */
export const THEME_SURFACE: Readonly<Record<ColorScheme, string>> = {
  light: '#f6faf8',
  dark: '#101413',
};

export function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference);
}

/**
 * The colour theme. A manual choice sets `data-theme` on `<html>`, which pins `color-scheme`
 * in the global styles; `system` removes it so the browser's setting applies.
 */
@Service()
export class Theme {
  private readonly document = inject(DOCUMENT);
  private readonly darkQuery = this.document.defaultView?.matchMedia?.(
    '(prefers-color-scheme: dark)',
  );
  private readonly systemDark = signal(this.darkQuery?.matches ?? false);

  private readonly preferenceState = signal<ThemePreference>(this.readStored());
  readonly preference = this.preferenceState.asReadonly();

  /** The scheme actually shown. */
  readonly scheme = computed<ColorScheme>(() => {
    const preference = this.preference();
    if (preference !== 'system') return preference;
    return this.systemDark() ? 'dark' : 'light';
  });

  constructor() {
    const onSystemChange = (event: MediaQueryListEvent) =>
      this.systemDark.set(event.matches);
    this.darkQuery?.addEventListener('change', onSystemChange);
    inject(DestroyRef).onDestroy(() =>
      this.darkQuery?.removeEventListener('change', onSystemChange),
    );

    // Document-level side effect outside Angular's rendering: <html> and <head>.
    effect(() => this.apply(this.preference()));
  }

  setPreference(preference: ThemePreference): void {
    this.preferenceState.set(preference);
    try {
      const storage = this.document.defaultView?.localStorage;
      if (preference === 'system') storage?.removeItem(THEME_STORAGE_KEY);
      else storage?.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // Storage can be blocked (private mode); the choice then lasts for this visit only.
    }
  }

  private readStored(): ThemePreference {
    try {
      const stored =
        this.document.defaultView?.localStorage.getItem(THEME_STORAGE_KEY);
      return isThemePreference(stored) ? stored : 'system';
    } catch {
      return 'system';
    }
  }

  private apply(preference: ThemePreference): void {
    const root = this.document.documentElement;
    if (preference === 'system') delete root.dataset['theme'];
    else root.dataset['theme'] = preference;

    const metas = this.document.head.querySelectorAll<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    for (const meta of metas) {
      const metaScheme: ColorScheme = meta.media.includes('dark')
        ? 'dark'
        : 'light';
      meta.content =
        THEME_SURFACE[preference === 'system' ? metaScheme : preference];
    }
  }
}

/** Starts the theme at bootstrap, so the remembered choice and the meta tags apply at once. */
export function provideTheme(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAppInitializer(() => {
      inject(Theme);
    }),
  ]);
}
