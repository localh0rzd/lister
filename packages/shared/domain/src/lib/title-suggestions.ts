import { compareTitles } from './sorting';
import { sameItemKey } from './runs';

/** How many suggestions the add-item field shows at most. */
export const MAX_TITLE_SUGGESTIONS = 5;

/**
 * Item titles to offer while `text` is typed into an add-item field (D22): titles that contain
 * the text anywhere, ignoring case and surrounding spaces. Titles identical by the D16 rule are
 * offered once (the first spelling seen), titles identical to one in `exclude` (what the list or
 * run already holds) are left out, and titles that start with the text come first, then A–Z.
 * Nothing is offered for empty text.
 */
export function suggestTitles(
  titles: readonly string[],
  text: string,
  exclude: readonly string[] = [],
  limit = MAX_TITLE_SUGGESTIONS,
): string[] {
  const needle = sameItemKey(text);
  if (!needle) return [];
  const seen = new Set(exclude.map(sameItemKey));
  const prefix: string[] = [];
  const inside: string[] = [];
  for (const title of titles) {
    const key = sameItemKey(title);
    const at = key.indexOf(needle);
    if (at < 0 || seen.has(key)) continue;
    seen.add(key);
    (at === 0 ? prefix : inside).push(title.trim());
  }
  const byTitle = (a: string, b: string) =>
    compareTitles(a, b) || (a < b ? -1 : a > b ? 1 : 0);
  return [...prefix.sort(byTitle), ...inside.sort(byTitle)].slice(0, limit);
}
