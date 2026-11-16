import { sameItemKey } from './runs';

/** A leading bullet ("- ", "* ", "• ", "1. ", "1) ") and/or checkbox ("[ ]", "[x]"). */
const MARKERS = /^(?:(?:[-*•]|\d+[.)])\s+)?(?:\[[ xX]?\]\s*)?/u;

/**
 * Pasted text as item titles (D18): one per line, trimmed, blank lines dropped, bullet and
 * checkbox markers removed, and identical lines (D16: case and surrounding spaces ignored)
 * kept once, the first one. The text becomes the title only, with no quantity parsing.
 */
export function cleanItemLines(text: string): string[] {
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const line of text.split(/\r\n|\r|\n/)) {
    const title = line.trim().replace(MARKERS, '').trim();
    if (title === '') continue;
    const key = sameItemKey(title);
    if (seen.has(key)) continue;
    seen.add(key);
    titles.push(title);
  }
  return titles;
}
