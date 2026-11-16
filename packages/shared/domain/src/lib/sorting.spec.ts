import { comparePositions, positionsFromStart } from './positions';
import { compareTitles, positionForSortedInsert, sortByTitle } from './sorting';

const rows = (titles: string[], keys = positionsFromStart(titles.length)) =>
  titles.map((title, i) => ({ id: `id-${title}`, title, position: keys[i] }));

/** Applies changes and returns the titles in position order. */
function apply(
  list: ReturnType<typeof rows>,
  changes: { id: string; position: string }[],
  others: { id: string; position: string }[] = [],
) {
  const moved = new Map(changes.map((c) => [c.id, c.position]));
  const next = list.map((r) => ({
    ...r,
    position: moved.get(r.id) ?? r.position,
  }));
  return [...next, ...others.map((o) => ({ ...o, title: `<${o.id}>` }))]
    .sort(comparePositions)
    .map((r) => r.title);
}

describe('compareTitles', () => {
  it.each([
    ['apple', 'Banana', -1],
    ['Éclair', 'eclair', 0],
    ['Item 9', 'Item 10', -1],
    ['b', 'a', 1],
  ])('compares %s with %s', (a, b, expected) => {
    expect(Math.sign(compareTitles(a, b))).toBe(expected);
  });
});

describe('sortByTitle', () => {
  it.each([
    [[], []],
    [['a'], ['a']],
    [
      ['c', 'b', 'a'],
      ['a', 'b', 'c'],
    ],
    [
      ['banana', 'Apple', 'cherry'],
      ['Apple', 'banana', 'cherry'],
    ],
    [
      ['Item 10', 'Item 9', 'item 1'],
      ['item 1', 'Item 9', 'Item 10'],
    ],
    [
      ['zèbra', 'zebra', 'Zed'],
      ['zèbra', 'zebra', 'Zed'],
    ],
  ])('sorts %j', (titles, expected) => {
    const list = rows(titles);
    expect(apply(list, sortByTitle(list))).toEqual(expected);
  });

  it('returns nothing when already sorted, and when applied twice', () => {
    const list = rows(['c', 'a', 'b']);
    const changes = sortByTitle(list);
    const sorted = list.map((r) => ({
      ...r,
      position: changes.find((c) => c.id === r.id)?.position ?? r.position,
    }));
    expect(sortByTitle(sorted)).toEqual([]);
  });

  it('only changes the rows that move and reuses the keys they held', () => {
    const list = rows(['a', 'c', 'b', 'd']);
    const changes = sortByTitle(list);
    expect(changes.map((c) => c.id).sort()).toEqual(['id-b', 'id-c']);
    expect(changes.find((c) => c.id === 'id-b')?.position).toBe(
      list[1].position,
    );
    expect(changes.find((c) => c.id === 'id-c')?.position).toBe(
      list[2].position,
    );
  });

  it('keeps others (includes) in their slots', () => {
    const keys = positionsFromStart(4);
    const list = [
      { id: 'id-z', title: 'z', position: keys[0] },
      { id: 'id-y', title: 'y', position: keys[2] },
      { id: 'id-x', title: 'x', position: keys[3] },
    ];
    const include = { id: 'inc', position: keys[1] };
    expect(apply(list, sortByTitle(list, [include]), [include])).toEqual([
      'x',
      '<inc>',
      'y',
      'z',
    ]);
  });

  it('gives rows that share a key fresh keys between their neighbours', () => {
    const keys = positionsFromStart(3);
    const list = [
      { id: 'id-a', title: 'b', position: keys[0] },
      { id: 'id-b', title: 'a', position: keys[1] },
      { id: 'id-c', title: 'c', position: keys[1] },
      { id: 'id-d', title: 'd', position: keys[2] },
    ];
    const changes = sortByTitle(list);
    const result = apply(list, changes);
    expect(result).toEqual(['a', 'b', 'c', 'd']);
    const positions = list.map(
      (r) => changes.find((c) => c.id === r.id)?.position ?? r.position,
    );
    expect(new Set(positions).size).toBe(4);
  });
});

describe('positionForSortedInsert', () => {
  const place = (title: string, list: ReturnType<typeof rows>) => {
    const position = positionForSortedInsert(title, list, list);
    return [...list, { id: 'new', title, position }]
      .sort(comparePositions)
      .map((r) => r.title);
  };

  it('goes before the first item that sorts after it', () => {
    expect(place('c', rows(['a', 'b', 'd', 'e']))).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
    expect(place('A', rows(['b', 'c']))).toEqual(['A', 'b', 'c']);
  });

  it('goes at the end when nothing sorts after it, and into an empty list', () => {
    expect(place('z', rows(['a', 'b']))).toEqual(['a', 'b', 'z']);
    expect(place('a', [])).toEqual(['a']);
  });

  it('goes before the first later item even when the order is not sorted', () => {
    expect(place('m', rows(['a', 'z', 'b']))).toEqual(['a', 'm', 'z', 'b']);
  });

  it('puts it among siblings only, with other rows in between', () => {
    const keys = positionsFromStart(4);
    const all = [
      { id: 'o', position: keys[0] },
      { id: 'a', position: keys[1] },
      { id: 'i', position: keys[2] },
      { id: 'c', position: keys[3] },
    ];
    const siblings = [
      { id: 'a', title: 'a', position: keys[1] },
      { id: 'c', title: 'c', position: keys[3] },
    ];
    const position = positionForSortedInsert('b', siblings, all);
    expect(position > keys[1] && position < keys[3]).toBe(true);
  });
});
