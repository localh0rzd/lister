import type { Item, List, Run } from './entities';
import { MAX_SEARCH_RESULTS, search, searchKey } from './search';

const base = {
  spaceId: 's',
  version: 1,
  deletedAt: null,
  createdBy: 'u',
  updatedBy: 'u',
  createdAt: 0,
  updatedAt: 0,
};
const list = (id: string, title: string): List => ({
  ...base,
  id,
  title,
  description: '',
});
const item = (id: string, listId: string, title: string, note = ''): Item => ({
  ...base,
  id,
  listId,
  title,
  note,
  quantity: '',
  position: 'a0',
});
const run = (id: string, title: string): Run => ({
  ...base,
  id,
  title,
  sourceListId: null,
  finishedAt: null,
});

describe('searchKey', () => {
  it.each([
    ['Crème BRÛLÉE', 'creme brulee'],
    ['  two   words ', 'two words'],
    ['Zahnbürste', 'zahnburste'],
    ['', ''],
    ['   ', ''],
  ])('turns %j into %j', (text, key) => {
    expect(searchKey(text)).toBe(key);
  });
});

describe('search (D25)', () => {
  const lists = [list('l1', 'Camping'), list('l2', 'Café trip')];
  const items = [
    item('i1', 'l1', 'Tent'),
    item('i2', 'l1', 'Gas stove', 'for the tent'),
    item('i3', 'l2', 'Espresso'),
  ];
  const runs = [run('r1', 'Camping weekend')];
  const data = { lists, items, runs };

  it('finds nothing for empty or blank text', () => {
    for (const query of ['', '   ']) {
      expect(search(data, query)).toEqual({ lists: [], items: [], runs: [] });
    }
  });

  it('finds lists, items and runs, ignoring case and accents', () => {
    expect(search(data, 'CAMP')).toMatchObject({
      lists: [{ id: 'l1' }],
      items: [],
      runs: [{ id: 'r1' }],
    });
    expect(search(data, 'cafe').lists.map((l) => l.id)).toEqual(['l2']);
    expect(search(data, 'ESPRÉ').items.map((m) => m.item.id)).toEqual(['i3']);
  });

  it('names the list of an item result', () => {
    expect(search(data, 'espresso').items).toEqual([
      { item: items[2], list: lists[1] },
    ]);
  });

  it('matches an item by its note, after the items whose title matches', () => {
    expect(search(data, 'tent').items.map((m) => m.item.id)).toEqual([
      'i1',
      'i2',
    ]);
  });

  it('does not search the notes of lists or the titles inside other rows', () => {
    expect(search(data, 'for the').lists).toEqual([]);
    expect(search(data, 'for the').runs).toEqual([]);
  });

  it('ranks a title that starts with the text, then one with a word that does, then the rest', () => {
    const found = search(
      {
        lists: [
          list('a', 'Backpack'),
          list('b', 'My pack list'),
          list('c', 'Pack'),
          list('d', 'Day pack'),
        ],
        items: [],
        runs: [],
      },
      'pack',
    );
    expect(found.lists.map((l) => l.id)).toEqual(['c', 'd', 'b', 'a']);
  });

  it('orders equal ranks A–Z with numbers by value, then by id', () => {
    const found = search(
      {
        lists: [
          list('3', 'List 10'),
          list('2', 'List 9'),
          list('1', 'list 9'),
          list('0', 'List 2'),
        ],
        items: [],
        runs: [],
      },
      'list',
    );
    expect(found.lists.map((l) => l.id)).toEqual(['0', '1', '2', '3']);
  });

  it('leaves out an item whose list is not among the lists searched', () => {
    expect(search({ lists: [], items, runs: [] }, 'tent').items).toEqual([]);
  });

  it('finds text across unicode and treats regex characters literally', () => {
    const odd = {
      lists: [list('a', 'Zelt (2.0) ⛺'), list('b', 'Zelt 2x0')],
      items: [],
      runs: [],
    };
    expect(search(odd, '(2.0)').lists.map((l) => l.id)).toEqual(['a']);
    expect(search(odd, '⛺').lists.map((l) => l.id)).toEqual(['a']);
  });

  it('shows at most MAX_SEARCH_RESULTS per group', () => {
    const many = Array.from({ length: MAX_SEARCH_RESULTS + 5 }, (_, i) =>
      list(String(i).padStart(3, '0'), `Trip ${i}`),
    );
    expect(
      search({ lists: many, items: [], runs: [] }, 'trip').lists,
    ).toHaveLength(MAX_SEARCH_RESULTS);
  });
});
