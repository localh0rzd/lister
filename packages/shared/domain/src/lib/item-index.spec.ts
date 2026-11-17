import type { Item, List } from './entities';
import { indexItems } from './item-index';

const meta = {
  spaceId: 's',
  version: 1,
  deletedAt: null,
  createdBy: 'u',
  updatedBy: 'u',
  createdAt: 0,
  updatedAt: 0,
};
const list = (id: string, title: string): List => ({
  ...meta,
  id,
  title,
  description: '',
  colour: null,
  icon: null,
});
const item = (
  id: string,
  listId: string,
  title: string,
  extra: Partial<Item> = {},
): Item => ({
  ...meta,
  id,
  listId,
  title,
  quantity: '',
  note: '',
  position: 'a0',
  ...extra,
});

const lists = [list('l1', 'Trip'), list('l2', 'Camping'), list('l3', 'Home')];
const summary = (rows: ReturnType<typeof indexItems>) =>
  rows.map((r) => [r.title, r.lists.map((l) => l.title)]);

describe('indexItems', () => {
  it('is empty without items', () => {
    expect(indexItems(lists, [])).toEqual([]);
  });

  it('sorts by title like lists: ignoring case, numbers by value', () => {
    const rows = indexItems(lists, [
      item('a', 'l1', 'item 10'),
      item('b', 'l1', 'Zebra'),
      item('c', 'l1', 'Item 9'),
      item('d', 'l1', 'apple'),
    ]);
    expect(rows.map((r) => r.title)).toEqual([
      'apple',
      'Item 9',
      'item 10',
      'Zebra',
    ]);
  });

  it('merges identical items (case, surrounding spaces) and lists their lists by title', () => {
    const rows = indexItems(lists, [
      item('a', 'l1', 'Tent'),
      item('b', 'l2', '  tent '),
      item('c', 'l3', 'TENT'),
    ]);
    expect(summary(rows)).toEqual([['Tent', ['Camping', 'Home', 'Trip']]]);
  });

  it('names a list once when it holds the same item twice', () => {
    const rows = indexItems(lists, [
      item('a', 'l1', 'Tent'),
      item('b', 'l1', 'tent'),
    ]);
    expect(summary(rows)).toEqual([['Tent', ['Trip']]]);
  });

  it('leaves out deleted items and items of deleted or unknown lists', () => {
    const rows = indexItems(
      [lists[0]],
      [
        item('a', 'l1', 'Kept'),
        item('b', 'l1', 'Gone', { deletedAt: 1 }),
        item('c', 'l2', 'Elsewhere'),
      ],
    );
    expect(summary(rows)).toEqual([['Kept', ['Trip']]]);
  });

  it('keeps an item under its own list, not under lists that include it', () => {
    // Includes aren't an input: only the item's own list is ever named.
    const rows = indexItems(lists, [item('a', 'l2', 'Stove')]);
    expect(summary(rows)).toEqual([['Stove', ['Camping']]]);
  });

  it('is independent of input order', () => {
    const items = [item('a', 'l1', 'Tent'), item('b', 'l2', 'tent')];
    expect(indexItems(lists, items)).toEqual(
      indexItems([...lists].reverse(), [...items].reverse()),
    );
  });

  it('handles unicode titles', () => {
    const rows = indexItems(lists, [
      item('a', 'l1', 'Éclair'),
      item('b', 'l2', 'eclair'),
    ]);
    expect(rows).toHaveLength(2);
  });
});
