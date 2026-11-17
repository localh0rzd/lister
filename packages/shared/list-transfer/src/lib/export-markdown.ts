import {
  type CompositionSource,
  type Id,
  flattenEntries,
} from '@lister/shared/domain';

/**
 * A list as Markdown: its title as `#`, its items as `- ` lines ("Tent (2) — big one": quantity
 * in brackets, then the note), and each included list as a sub-heading with its items. A list
 * reached twice appears once (D2); a list in the trash is left out.
 */
export function listToMarkdown(listId: Id, source: CompositionSource): string {
  const title = source.list(listId)?.title ?? '';
  const lines = [`# ${title}`, ''];
  for (const entry of flattenEntries(listId, source)) {
    if (entry.kind === 'section') {
      if (entry.state !== 'live' || !entry.list) continue;
      const level = Math.min(entry.depth + 2, 6);
      lines.push('', `${'#'.repeat(level)} ${entry.list.title}`, '');
      continue;
    }
    const { title: name, quantity, note } = entry.item;
    lines.push(
      `- ${name}${quantity ? ` (${quantity})` : ''}${note ? ` — ${note}` : ''}`,
    );
  }
  return `${lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()}\n`;
}
