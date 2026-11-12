import {
  isRunFinished,
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
