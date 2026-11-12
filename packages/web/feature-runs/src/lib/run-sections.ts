import type { Id, RunItem } from '@lister/shared/domain';

/** One item as the run page shows it. */
export interface RunRow {
  item: RunItem;
  /** Titles of the other lists a merged item came from (D16). */
  alsoFrom: string[];
}

/** Items that came from one list, or were typed into the run (`listId` null). */
export interface RunSection {
  key: string;
  listId: Id | null;
  /** `null` when the run has only this one group of typed-in items: no header then. */
  title: string | null;
  rows: RunRow[];
}

export interface RunLayout {
  sections: RunSection[];
  /** Checked and skipped items while the "Done" section is on (D12); otherwise empty. */
  done: RunRow[];
  /** Items checked or skipped, of all items. */
  progress: { done: number; total: number };
}

/**
 * Groups a run's items (in position order) by the list they came from, the first source of
 * each deciding (design §3); sections follow their first item. With `doneSection` on, checked
 * and skipped items move into `done` instead (D12).
 */
export function layoutRun(
  items: readonly RunItem[],
  listTitle: (listId: Id) => string | undefined,
  doneSection: boolean,
): RunLayout {
  const title = (id: Id) => listTitle(id) ?? 'Deleted list';
  const sections = new Map<string, RunSection>();
  const done: RunRow[] = [];
  for (const item of items) {
    const row: RunRow = { item, alsoFrom: item.sources.slice(1).map(title) };
    if (doneSection && item.state !== 'unchecked') {
      done.push(row);
      continue;
    }
    const listId = item.sources[0] ?? null;
    const key = listId ?? 'here';
    let section = sections.get(key);
    if (!section) {
      section = {
        key,
        listId,
        title: listId ? title(listId) : 'Added to this run',
        rows: [],
      };
      sections.set(key, section);
    }
    section.rows.push(row);
  }
  const list = [...sections.values()];
  if (list.length === 1 && list[0].listId === null) list[0].title = null;
  return {
    sections: list,
    done,
    progress: {
      done: items.filter((item) => item.state !== 'unchecked').length,
      total: items.length,
    },
  };
}

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** A new run's title: "Alps trip · 12 Nov 2026", or just the date for an ad-hoc run. */
export function runTitle(listTitle: string | null, date = new Date()): string {
  const day = dateFormat.format(date);
  return listTitle ? `${listTitle} · ${day}` : day;
}

/** "3 of 10 done" */
export function progressText(progress: { done: number; total: number }) {
  return progress.total === 0
    ? 'No items yet'
    : `${progress.done} of ${progress.total} done`;
}
