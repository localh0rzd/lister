import type { MutationInput } from '@lister/shared/sync-protocol';

/** The titles of rows a mutation refers to by id; unknown (or gone) rows give `undefined`. */
export interface TitleLookup {
  list(id: string): Promise<string | undefined>;
  item(id: string): Promise<string | undefined>;
  run(id: string): Promise<string | undefined>;
  runItem(id: string): Promise<string | undefined>;
  /** The lists an include connects. */
  include(
    id: string,
  ): Promise<{ parentListId: string; childListId: string } | undefined>;
}

/** Titles longer than this are cut short, so a refusal notice stays a few lines long. */
export const DESCRIBED_TITLE_MAX = 40;

const quote = (title: string | undefined): string => {
  if (title === undefined) return '(unknown)';
  // By code point, so an emoji is never cut in half.
  const chars = Array.from(title);
  return chars.length > DESCRIBED_TITLE_MAX
    ? `“${chars
        .slice(0, DESCRIBED_TITLE_MAX - 1)
        .join('')
        .trimEnd()}…”`
    : `“${title}”`;
};

/**
 * A short, readable description of a change, e.g. `Add item “Stove” to “Camping”`, stored with
 * a refusal so the user can tell which change it was. Titles that the mutation doesn't carry
 * are looked up in the local rows.
 */
export async function describeMutation(
  mutation: MutationInput,
  titles: TitleLookup,
): Promise<string> {
  const args: Record<string, unknown> = mutation.args;
  const str = (key: string): string | undefined =>
    typeof args[key] === 'string' ? args[key] : undefined;
  const id = str('id') ?? '';
  const list = async (key: string) => quote(await titles.list(str(key) ?? ''));
  const patch = (args['patch'] ?? {}) as Record<string, unknown>;
  const changed = Object.keys(patch).join(', ') || 'details';
  const include = async (verb: string, preposition: string) => {
    const lists = await titles.include(id);
    return `${verb} ${quote(lists && (await titles.list(lists.childListId)))} ${preposition} ${quote(lists && (await titles.list(lists.parentListId)))}`;
  };
  switch (mutation.name) {
    case 'list.create':
      return `Create list ${quote(str('title'))}`;
    case 'list.update':
      return `Edit list ${quote(await titles.list(id))} (${changed})`;
    case 'list.delete':
      return `Delete list ${quote(await titles.list(id))}`;
    case 'list.restore':
      return `Restore list ${quote(await titles.list(id))}`;
    case 'list.duplicate':
      return `Duplicate list ${await list('sourceListId')} as ${quote(str('title'))}`;
    case 'list.import': {
      const count = Array.isArray(args['lists']) ? args['lists'].length : 0;
      return `Import ${count === 1 ? '1 list' : `${count} lists`}`;
    }
    case 'list.sortItems':
      return `Sort list ${await list('listId')} A–Z`;
    case 'item.create':
      return `Add item ${quote(str('title'))} to ${await list('listId')}`;
    case 'item.update':
      return `Edit item ${quote(await titles.item(id))} (${changed})`;
    case 'item.move':
      return `Move item ${quote(await titles.item(id))}`;
    case 'item.delete':
      return `Delete item ${quote(await titles.item(id))}`;
    case 'item.restore':
      return `Restore item ${quote(await titles.item(id))}`;
    case 'run.start':
      return `Start run ${quote(str('title'))}`;
    case 'run.update':
      return `Rename run ${quote(await titles.run(id))}`;
    case 'run.restore':
      return `Restore run ${quote(await titles.run(id))}`;
    case 'run.addItems':
      return `Add items to run ${quote(await titles.run(str('runId') ?? ''))}`;
    case 'run.saveAsList':
      return `Save run ${quote(await titles.run(str('runId') ?? ''))} as list ${quote(str('title'))}`;
    case 'run.sortItems':
      return `Sort run ${quote(await titles.run(str('runId') ?? ''))} A–Z`;
    case 'runItem.update':
      return `Edit run item ${quote(await titles.runItem(id))} (${changed})`;
    case 'runItem.move':
      return `Move run item ${quote(await titles.runItem(id))}`;
    case 'runItem.remove':
      return `Remove run item ${quote(await titles.runItem(id))}`;
    case 'runItem.restore':
      return `Restore run item ${quote(await titles.runItem(id))}`;
    case 'runItem.setState':
      return `Mark run item ${quote(await titles.runItem(id))} as ${str('state') ?? 'changed'}`;
    case 'include.create':
      return `Include ${await list('childListId')} in ${await list('parentListId')}`;
    case 'include.move':
      return include('Move', 'in');
    case 'include.delete':
      return include('Remove', 'from');
    case 'include.restore':
      return include('Restore', 'in');
  }
}

/** What to show for a refusal: the change (when it was recorded) and the reason. */
export function rejectionText(rejection: {
  description?: string;
  reason: string;
}): string {
  return rejection.description
    ? `${rejection.description} — ${rejection.reason}`
    : rejection.reason;
}
