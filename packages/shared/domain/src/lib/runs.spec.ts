import {
  finishedBy,
  isRunFinished,
  lastCheckedItem,
  mergeNote,
  mergeQuantity,
  mergeRunItem,
  mergeSources,
  sameItemKey,
} from './runs';

describe('sameItemKey (D16)', () => {
  it.each([
    ['Headlamp', ' headlamp '],
    ['ZAHNBÜRSTE', 'zahnbürste'],
  ])('%j and %j are the same item', (a, b) => {
    expect(sameItemKey(a)).toBe(sameItemKey(b));
  });

  it('keeps different words apart', () => {
    expect(sameItemKey('Head lamp')).not.toBe(sameItemKey('Headlamp'));
  });
});

describe('mergeQuantity (D16)', () => {
  it.each([
    ['', '', ''],
    ['', '1', ''],
    ['', '2', '2'],
    ['2', '', '2'],
    ['3', '2', '3'],
    ['2', '3', '3'],
    ['1.5', '2', '2'],
    ['2 pairs', '1 pair', '2 pairs, 1 pair'],
    ['2 pairs', '2 PAIRS', '2 pairs'],
    ['2 pairs, 1 pair', '1 pair', '2 pairs, 1 pair'],
    ['500 g', '', '500 g'],
    ['', '500 g', '500 g'],
    ['3', '500 g', '3, 500 g'],
  ])('%j + %j → %j', (existing, incoming, merged) => {
    expect(mergeQuantity(existing, incoming)).toBe(merged);
  });

  it('stays within the quantity limit', () => {
    const merged = mergeQuantity('x'.repeat(45), 'y'.repeat(10));
    expect([...merged]).toHaveLength(50);
    expect(merged.endsWith('…')).toBe(true);
  });
});

describe('mergeNote', () => {
  it.each([
    ['', '', ''],
    ['wool', '', 'wool'],
    ['', 'wool', 'wool'],
    ['wool', 'wool', 'wool'],
    ['wool', 'black', 'wool · black'],
    ['Wool', 'wool', 'Wool'],
    ['tent', 'tent pegs too', 'tent pegs too'],
  ])('%j + %j → %j', (existing, incoming, merged) => {
    expect(mergeNote(existing, incoming)).toBe(merged);
  });
});

describe('mergeSources', () => {
  it('keeps the order and each list once', () => {
    expect(mergeSources(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
    expect(mergeSources([], [])).toEqual([]);
  });
});

describe('mergeRunItem', () => {
  const base = {
    quantity: '1',
    note: '',
    sources: ['a'],
    state: 'checked' as const,
  };

  it('unchecks a checked item when the merge raises its quantity', () => {
    expect(
      mergeRunItem(base, { quantity: '2', note: '', sources: ['b'] }),
    ).toEqual({
      quantity: '2',
      note: '',
      sources: ['a', 'b'],
      state: 'unchecked',
    });
  });

  it('keeps it checked when the quantity stays', () => {
    expect(
      mergeRunItem(base, { quantity: '', note: 'spare', sources: ['b'] }).state,
    ).toBe('checked');
  });

  it('leaves skipped and unchecked items as they are', () => {
    for (const state of ['skipped', 'unchecked'] as const) {
      expect(
        mergeRunItem(
          { ...base, state },
          { quantity: '5', note: '', sources: [] },
        ).state,
      ).toBe(state);
    }
  });
});

describe('isRunFinished (D10)', () => {
  const item = (
    state: 'unchecked' | 'checked' | 'skipped',
    deletedAt: number | null = null,
  ) => ({
    state,
    deletedAt,
  });

  it.each([
    ['no items', [], false],
    ['one unchecked', [item('unchecked')], false],
    ['all checked or skipped', [item('checked'), item('skipped')], true],
    ['one still unchecked', [item('checked'), item('unchecked')], false],
    [
      'the unchecked one removed',
      [item('checked'), item('unchecked', 5)],
      true,
    ],
    ['only removed items', [item('checked', 5)], false],
  ])('%s → %s', (_, items, finished) => {
    expect(isRunFinished(items)).toBe(finished);
  });
});

describe('lastCheckedItem (D20)', () => {
  const item = (
    id: string,
    state: 'unchecked' | 'checked' | 'skipped',
    stateAt: number | null,
    deletedAt: number | null = null,
    position = 'a0',
  ) => ({ id, state, stateAt, deletedAt, position });

  it('is the checked or skipped item whose state was set last', () => {
    const items = [
      item('a', 'checked', 10),
      item('b', 'skipped', 30),
      item('c', 'checked', 20),
    ];
    expect(lastCheckedItem(items)?.id).toBe('b');
  });

  it('ignores unchecked and removed items', () => {
    const items = [
      item('a', 'checked', 10),
      item('b', 'unchecked', 50),
      item('c', 'checked', 40, 99),
    ];
    expect(lastCheckedItem(items)?.id).toBe('a');
  });

  it('breaks ties by position, then id, the same way everywhere', () => {
    expect(
      lastCheckedItem([
        item('a', 'checked', 10, null, 'a1'),
        item('b', 'checked', 10, null, 'a2'),
      ])?.id,
    ).toBe('b');
    expect(
      lastCheckedItem([item('b', 'checked', 10), item('a', 'checked', 10)])?.id,
    ).toBe('b');
  });

  it('is undefined when nothing is checked', () => {
    expect(lastCheckedItem([])).toBeUndefined();
    expect(lastCheckedItem([item('a', 'unchecked', null)])).toBeUndefined();
  });
});

describe('finishedBy (D10)', () => {
  const item = (
    extra: Partial<{
      state: 'unchecked' | 'checked' | 'skipped';
      stateAt: number | null;
      stateBy: string | null;
      updatedAt: number;
      updatedBy: string;
    }> = {},
  ) => ({
    state: 'checked' as const,
    stateAt: 10,
    stateBy: 'anna',
    updatedAt: 10,
    updatedBy: 'anna',
    ...extra,
  });

  it('is who made the check that finished it, even after a later rename', () => {
    const run = { finishedAt: 20, updatedBy: 'ben' }; // Ben renamed it afterwards
    expect(
      finishedBy(run, [
        item(),
        item({ stateAt: 20, stateBy: 'cleo', updatedAt: 30, updatedBy: 'dan' }),
      ]),
    ).toBe('cleo');
  });

  it('is who removed the last unchecked item', () => {
    const run = { finishedAt: 20, updatedBy: 'ben' };
    expect(
      finishedBy(run, [
        item(),
        item({
          state: 'unchecked',
          stateAt: null,
          stateBy: null,
          updatedAt: 20,
          updatedBy: 'cleo',
        }),
      ]),
    ).toBe('cleo');
  });

  it("falls back to the run's last change when nothing matches", () => {
    expect(finishedBy({ finishedAt: 20, updatedBy: 'ben' }, [item()])).toBe(
      'ben',
    );
    expect(finishedBy({ finishedAt: null, updatedBy: 'ben' }, [])).toBe('ben');
  });
});
