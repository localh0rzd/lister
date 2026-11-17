import type { CompositionSource, Id } from '@lister/shared/domain';
import { groupsOfList } from './list-groups';

/**
 * A list as Markdown: its title as `#`, its own items as `- ` lines ("Tent (2) — big one":
 * quantity in brackets, then the note), then each included list as a sub-heading (deeper lists
 * one level further down) with its items. A list reached twice appears once (D2); a list in the
 * trash is left out.
 */
export function listToMarkdown(listId: Id, source: CompositionSource): string {
  const title = source.list(listId)?.title ?? '';
  const lines = [`# ${title}`, ''];
  for (const group of groupsOfList(listId, source)) {
    if (group.title !== null) {
      const level = Math.min(group.depth + 1, 6);
      lines.push('', `${'#'.repeat(level)} ${group.title}`, '');
    }
    for (const { title: name, quantity, note } of group.items) {
      lines.push(
        `- ${name}${quantity ? ` (${quantity})` : ''}${note ? ` — ${note}` : ''}`,
      );
    }
  }
  return `${lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()}\n`;
}
