import {
  comparePositions,
  isPositionKey,
  positionAt,
  positionAtEnd,
  positionBetween,
  sortByPosition,
} from './positions';

const row = (id: string, position: string) => ({ id, position });
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe('positionBetween', () => {
  it('creates a first key, keys at both ends and keys in between', () => {
    const first = positionBetween(null, null);
    const after = positionBetween(first, null);
    const before = positionBetween(null, first);
    const middle = positionBetween(first, after);

    expect([before, first, middle, after]).toEqual(
      [...[before, first, middle, after]].sort(),
    );
    expect(new Set([before, first, middle, after]).size).toBe(4);
  });

  it('keeps inserting between the same two neighbours', () => {
    let low = positionBetween(null, null);
    const high = positionBetween(low, null);
    for (let i = 0; i < 50; i++) {
      const next = positionBetween(low, high);
      expect(next > low && next < high).toBe(true);
      low = next;
    }
  });

  it('refuses neighbours that are tied or out of order (positionAt handles ties)', () => {
    const key = positionBetween(null, null);

    expect(() => positionBetween(key, key)).toThrow(/positionAt/);
    expect(() => positionBetween(positionBetween(key, null), key)).toThrow();
  });
});

describe('ordering', () => {
  it('sorts by key, then by id for equal keys', () => {
    const rows = [row('b', 'a1'), row('c', 'a0'), row('a', 'a1')];

    expect(ids(sortByPosition(rows))).toEqual(['c', 'a', 'b']);
    expect(comparePositions(row('x', 'a0'), row('x', 'a0'))).toBe(0);
  });

  it('compares by code unit, like SQLite and IndexedDB (not by locale)', () => {
    // 'Z' (0x5A) sorts before 'a' (0x61) in base-62 keys.
    expect(ids(sortByPosition([row('1', 'a'), row('2', 'Z')]))).toEqual([
      '2',
      '1',
    ]);
  });

  it('does not change the input', () => {
    const rows = [row('b', 'a1'), row('a', 'a0')];
    sortByPosition(rows);
    expect(ids(rows)).toEqual(['b', 'a']);
  });
});

describe('two clients inserting at the same spot offline', () => {
  it('end up with the same order on every client', () => {
    const first = row(
      '0190a000-0000-7000-8000-000000000001',
      positionBetween(null, null),
    );
    const last = row(
      '0190a000-0000-7000-8000-000000000002',
      positionBetween(first.position, null),
    );
    // Both clients compute the key from the same neighbours, so the keys collide.
    const fromA = row(
      '0190a000-0000-7000-8000-00000000000a',
      positionBetween(first.position, last.position),
    );
    const fromB = row(
      '0190a000-0000-7000-8000-00000000000b',
      positionBetween(first.position, last.position),
    );
    expect(fromA.position).toBe(fromB.position);

    const onA = sortByPosition([first, last, fromA, fromB]);
    const onB = sortByPosition([fromB, last, fromA, first]);

    expect(ids(onA)).toEqual(ids(onB));
    expect(ids(onA)).toEqual([first.id, fromA.id, fromB.id, last.id]);
  });
});

describe('positionAtEnd and positionAt', () => {
  const rows = [row('a', 'a0'), row('b', 'a1'), row('c', 'a2')];

  it('appends after the largest key, also to an empty list', () => {
    expect(positionAtEnd(rows) > 'a2').toBe(true);
    expect(typeof positionAtEnd([])).toBe('string');
  });

  it.each([
    [0, ['new', 'a', 'b', 'c']],
    [1, ['a', 'new', 'b', 'c']],
    [3, ['a', 'b', 'c', 'new']],
    [99, ['a', 'b', 'c', 'new']],
    [-1, ['new', 'a', 'b', 'c']],
  ])('puts a row at index %i', (index, expected) => {
    const moved = row('new', positionAt(rows, index));

    expect(ids(sortByPosition([...rows, moved]))).toEqual(expected);
  });

  it('skips over a tie instead of failing', () => {
    const tied = [
      row('a', 'a0'),
      row('b', 'a1'),
      row('c', 'a1'),
      row('d', 'a2'),
    ];

    const moved = row('new', positionAt(tied, 2));

    expect(ids(sortByPosition([...tied, moved]))).toEqual([
      'a',
      'b',
      'c',
      'new',
      'd',
    ]);
  });
});

describe('isPositionKey', () => {
  it.each(['a0', 'a1', 'a0V', 'Zz', 'b0V'])('accepts %j', (key) => {
    expect(isPositionKey(key)).toBe(true);
  });

  it.each(['', 'a', 'a00', 'zzz', 'b0', 'a 0', 'A' + '0'.repeat(26), 42, null])(
    'rejects %j',
    (key) => {
      expect(isPositionKey(key)).toBe(false);
    },
  );

  it('accepts every key the helpers create', () => {
    let low: string | null = null;
    for (let i = 0; i < 30; i++) {
      low = positionBetween(low, null);
      expect(isPositionKey(low)).toBe(true);
    }
  });
});
