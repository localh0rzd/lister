import type { DiagnosticData, DiagnosticEntry } from './diagnostic-entry';

const MAX_STRING = 200;

/**
 * Text that may hold what users typed: a quoted title in a refusal (`“Milk” is already included`),
 * and anything between ASCII quotes. Replaced, so a reason keeps its shape but not its words. The
 * curly quotes are masked from the first opening to the last closing one, as the API's debug log
 * does (`log-text.ts`), because a title may contain `”` itself.
 */
const CURLY_QUOTED = /“.*”/gsu;
const ASCII_QUOTED = /"[^"]*"/g;
/** Registration links carry their secret token as a path segment. */
const REGISTRATION_TOKEN = /(\/registration-tokens\/)[^/]+/;

/** Makes one string safe to store: quoted text removed, control characters dropped, shortened. */
export function scrub(text: string): string {
  const clean = text
    .replace(CURLY_QUOTED, '“…”')
    .replace(ASCII_QUOTED, '“…”')
    // eslint-disable-next-line no-control-regex -- line breaks would break the one-line format
    .replace(/[\u0000-\u001f]+/g, ' ');
  return clean.length > MAX_STRING ? `${clean.slice(0, MAX_STRING)}…` : clean;
}

/** The entry's data with every string scrubbed and `undefined` fields dropped. */
export function scrubData(
  data: DiagnosticData | undefined,
): DiagnosticEntry['data'] {
  if (!data) return undefined;
  const result: NonNullable<DiagnosticEntry['data']> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    result[key] = typeof value === 'string' ? scrub(value) : value;
  }
  return result;
}

/** A request path without its query string, fragment or registration token (all can carry secrets). */
export function pathOf(url: string): string {
  const end = url.search(/[?#]/);
  const path = end === -1 ? url : url.slice(0, end);
  // Absolute URLs: keep the path only.
  return path
    .replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, '')
    .replace(REGISTRATION_TOKEN, '$1…');
}
