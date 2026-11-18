import {
  type CompositionSource,
  flatten,
  flattenEntries,
  wouldCreateCycle,
} from './composition';
import type { Include, IncludeException, Item, List } from './entities';
import { runItemsFromList } from './runs';

const meta = {
  spaceId: 'space',
  version: 1,
  deletedAt: null as number | null,
  createdBy: 'u',
  updatedBy: 'u',
  createdAt: 0,
  updatedAt: 0,
};

/** A small space: lists by id, items `list:title@position`, includes `parent>child@position`. */
function space(spec: {
  lists: string[];
  items?: string[];
  includes?: string[];
  /** `parent>child:item:<listId>-<title>` or `parent>child:list:<listId>`, on that include. */
  exceptions?: string[];
  deletedLists?: string[];
  deletedRows?: string[];
}): CompositionSource {
  const deleted = new Set(spec.deletedRows ?? []);
  const lists = new Map<string, List>(
    spec.lists.map((id) => [
      id,
      {
        ...meta,
        id,
        title: id,
        description: '',
        colour: null,
        icon: null,
        deletedAt: spec.deletedLists?.includes(id) ? 1 : null,
      },
    ]),
  );
  const items: Item[] = (spec.items ?? []).map((entry) => {
    const [listId, rest] = entry.split(':');
    const [title, position] = rest.split('@');
    return {
      ...meta,
      id: `${listId}-${title}`,
      listId,
      title,
      quantity: '',
      note: '',
      position,
      deletedAt: deleted.has(title) ? 1 : null,
    };
  });
  const includes: Include[] = (spec.includes ?? []).map((entry) => {
    const [edge, position] = entry.split('@');
    const [parentListId, childListId] = edge.split('>');
    return {
      ...meta,
      id: edge,
      parentListId,
      childListId,
      position,
      deletedAt: deleted.has(edge) ? 1 : null,
    };
  });
  const exceptions: IncludeException[] = (spec.exceptions ?? []).map(
    (entry) => {
      const [includeId, targetKind, targetId] = entry.split(':');
      return {
        ...meta,
        id: entry,
        includeId,
        targetKind: targetKind as 'item' | 'list',
        targetId,
        deletedAt: deleted.has(entry) ? 1 : null,
      };
    },
  );
  return {
    exceptionsOf: (includeId) =>
      exceptions.filter((row) => row.includeId === includeId),
    list: (id) => lists.get(id),
    itemsOf: (listId) => items.filter((row) => row.listId === listId),
    includesOf: (listId) =>
      includes.filter((row) => row.parentListId === listId),
  };
}

const flat = (listId: string, source: CompositionSource) =>
  flatten(listId, source).map(
    ({ item, listId: from }) => `${from}:${item.title}`,
  );

const view = (listId: string, source: CompositionSource) =>
  flattenEntries(listId, source).map((entry) =>
    entry.kind === 'item'
      ? `${'  '.repeat(entry.depth)}${entry.listId}:${entry.item.title}`
      : entry.kind === 'section'
        ? `${'  '.repeat(entry.depth)}[${entry.include.childListId} ${entry.state}]`
        : `${'  '.repeat(entry.depth)}-${entry.target.kind === 'item' ? entry.target.item.title : entry.target.include.childListId} (${entry.ownerListId})`,
  );

describe('flatten', () => {
  it("returns a list's own items in position order", () => {
    const source = space({
      lists: ['A'],
      items: ['A:c@a2', 'A:a@a0', 'A:b@a1'],
    });
    expect(flat('A', source)).toEqual(['A:a', 'A:b', 'A:c']);
  });

  it('puts an included list at its position among the items, as a section', () => {
    const source = space({
      lists: ['A', 'B'],
      items: ['A:tent@a0', 'A:map@a2', 'B:soap@a0', 'B:towel@a1'],
      includes: ['A>B@a1'],
    });
    expect(flat('A', source)).toEqual(['A:tent', 'B:soap', 'B:towel', 'A:map']);
  });

  it('recurses into nested includes', () => {
    const source = space({
      lists: ['A', 'B', 'C'],
      items: ['A:a@a0', 'B:b@a0', 'C:c@a0'],
      includes: ['A>B@a1', 'B>C@a1'],
    });
    expect(flat('A', source)).toEqual(['A:a', 'B:b', 'C:c']);
  });

  it('shows a list reached twice once, where it is first reached (diamond)', () => {
    const source = space({
      lists: ['Trip', 'Hostel', 'Camping', 'Toiletries'],
      items: ['Hostel:lock@a0', 'Camping:tent@a0', 'Toiletries:soap@a0'],
      includes: [
        'Trip>Hostel@a0',
        'Trip>Camping@a1',
        'Hostel>Toiletries@a1',
        'Camping>Toiletries@a1',
      ],
    });
    expect(flat('Trip', source)).toEqual([
      'Hostel:lock',
      'Toiletries:soap',
      'Camping:tent',
    ]);
  });

  it('stops at a cycle instead of looping', () => {
    const source = space({
      lists: ['A', 'B'],
      items: ['A:a@a0', 'B:b@a0'],
      includes: ['A>B@a1', 'B>A@a1'],
    });
    expect(flat('A', source)).toEqual(['A:a', 'B:b']);
  });

  it('leaves out deleted items, deleted includes and lists in the trash', () => {
    const source = space({
      lists: ['A', 'B', 'C'],
      items: ['A:keep@a0', 'A:gone@a1', 'B:b@a0', 'C:c@a0'],
      includes: ['A>B@a2', 'A>C@a3'],
      deletedRows: ['gone', 'A>B'],
      deletedLists: ['C'],
    });
    expect(flat('A', source)).toEqual(['A:keep']);
  });

  it('orders equal positions by id, the same on every client', () => {
    const source = space({ lists: ['A'], items: ['A:b@a0', 'A:a@a0'] });
    expect(flat('A', source)).toEqual(['A:a', 'A:b']);
  });
});

describe('flatten, edge cases', () => {
  it.each([
    ['an empty list', 'A', space({ lists: ['A'] }), []],
    ['an unknown list', 'nope', space({ lists: [] }), []],
    ['one item', 'A', space({ lists: ['A'], items: ['A:x@a0'] }), ['A:x']],
    [
      'a root in the trash (its own items still flatten; callers decide)',
      'A',
      space({ lists: ['A'], items: ['A:x@a0'], deletedLists: ['A'] }),
      ['A:x'],
    ],
    [
      'an include of an empty list',
      'A',
      space({ lists: ['A', 'B'], items: ['A:x@a0'], includes: ['A>B@a1'] }),
      ['A:x'],
    ],
    [
      'unicode titles, kept as they are',
      'A',
      space({ lists: ['A'], items: ['A:Zahnbürste 🪥@a0', 'A:Ölzeug@a1'] }),
      ['A:Zahnbürste 🪥', 'A:Ölzeug'],
    ],
    [
      'a deep chain',
      'L0',
      space({
        lists: ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'],
        items: ['L5:deep@a0'],
        includes: ['L0>L1@a0', 'L1>L2@a0', 'L2>L3@a0', 'L3>L4@a0', 'L4>L5@a0'],
      }),
      ['L5:deep'],
    ],
  ])('%s', (_, root, source, expected) => {
    expect(flat(root, source)).toEqual(expected);
  });
});

describe('flattenEntries (the editor view)', () => {
  it('shows each include as a section, also when the list is empty', () => {
    const source = space({
      lists: ['Trip', 'Toiletries', 'Camping'],
      items: ['Trip:map@a0', 'Camping:tent@a0'],
      includes: ['Trip>Toiletries@a1', 'Trip>Camping@a2'],
    });
    expect(view('Trip', source)).toEqual([
      'Trip:map',
      '[Toiletries live]',
      '[Camping live]',
      '  Camping:tent',
    ]);
  });

  it('marks a list in the trash as a deleted placeholder, and a repeat as repeated', () => {
    const source = space({
      lists: ['Trip', 'Hostel', 'Camping', 'Toiletries', 'Old'],
      items: ['Toiletries:soap@a0', 'Old:junk@a0'],
      includes: [
        'Trip>Hostel@a0',
        'Trip>Camping@a1',
        'Trip>Old@a2',
        'Hostel>Toiletries@a0',
        'Camping>Toiletries@a0',
      ],
      deletedLists: ['Old'],
    });
    expect(view('Trip', source)).toEqual([
      '[Hostel live]',
      '  [Toiletries live]',
      '    Toiletries:soap',
      '[Camping live]',
      '  [Toiletries repeated]',
      '[Old deleted]',
    ]);
  });

  it('gives the section its list, or none when the list is missing', () => {
    const source = space({ lists: ['A', 'B'], includes: ['A>B@a0', 'A>X@a1'] });
    const sections = flattenEntries('A', source).filter(
      (entry) => entry.kind === 'section',
    );
    expect(sections.map((s) => [s.list?.title, s.state])).toEqual([
      ['B', 'live'],
      [undefined, 'deleted'],
    ]);
  });
});

describe('leaving out (D28)', () => {
  const camping = {
    lists: ['Trip', 'Camping', 'Beach', 'Sleep'],
    items: [
      'Trip:Passport@a0',
      'Camping:Chair@a0',
      'Camping:Stove@a1',
      'Sleep:Bag@a0',
      'Beach:Towel@a0',
    ],
  };

  it('leaves out an item below a direct include, and reports it', () => {
    const source = space({
      ...camping,
      includes: ['Trip>Camping@a1'],
      exceptions: ['Trip>Camping:item:Camping-Chair'],
    });
    expect(flat('Trip', source)).toEqual(['Trip:Passport', 'Camping:Stove']);
    expect(flat('Camping', source)).toEqual(['Camping:Chair', 'Camping:Stove']);
    expect(flattenEntries('Trip', source)).toContainEqual(
      expect.objectContaining({
        kind: 'leftOut',
        listId: 'Camping',
        depth: 1,
        ownerListId: 'Trip',
        exception: expect.objectContaining({ includeId: 'Trip>Camping' }),
        target: expect.objectContaining({
          kind: 'item',
          item: expect.objectContaining({ title: 'Chair' }),
        }),
      }),
    );
  });

  it('leaves out a nested list with everything below it', () => {
    const source = space({
      ...camping,
      includes: ['Trip>Camping@a1', 'Camping>Sleep@a2'],
      exceptions: ['Trip>Camping:list:Sleep'],
    });
    expect(view('Trip', source)).toEqual([
      'Trip:Passport',
      '[Camping live]',
      '  Camping:Chair',
      '  Camping:Stove',
      '  -Sleep (Trip)',
    ]);
    expect(flat('Camping', source)).toContain('Sleep:Bag');
  });

  it('carries an exception through further includes (inherited)', () => {
    const source = space({
      lists: ['Holiday', ...camping.lists],
      items: camping.items,
      includes: ['Holiday>Trip@a0', 'Trip>Camping@a1'],
      exceptions: ['Trip>Camping:item:Camping-Chair'],
    });
    expect(flat('Holiday', source)).toEqual(['Trip:Passport', 'Camping:Stove']);
    expect(view('Holiday', source)).toContain('    -Chair (Trip)');
  });

  it('lets leaving out win when two paths disagree, whatever the order', () => {
    const lists = ['Holiday', 'Trip', 'Beach', 'Camping'];
    const items = ['Camping:Chair@a0', 'Camping:Stove@a1'];
    for (const [tripPos, beachPos] of [
      ['a0', 'a1'],
      ['a1', 'a0'],
    ]) {
      const source = space({
        lists,
        items,
        includes: [
          `Holiday>Trip@${tripPos}`,
          `Holiday>Beach@${beachPos}`,
          'Trip>Camping@a0',
          'Beach>Camping@a0',
        ],
        exceptions: ['Trip>Camping:item:Camping-Chair'],
      });
      expect(flat('Holiday', source)).toEqual(['Camping:Stove']);
    }
  });

  it('prefers the exception nearest to the viewed list', () => {
    const source = space({
      lists: ['Holiday', 'Trip', 'Camping'],
      items: ['Camping:Chair@a0'],
      includes: ['Holiday>Trip@a0', 'Trip>Camping@a0'],
      exceptions: [
        'Trip>Camping:item:Camping-Chair',
        'Holiday>Trip:item:Camping-Chair',
      ],
    });
    expect(view('Holiday', source)).toContain('    -Chair (Holiday)');
  });

  it('ignores a target that is not below the include, or whose kind does not match', () => {
    const source = space({
      ...camping,
      includes: ['Trip>Camping@a1'],
      exceptions: [
        'Trip>Camping:item:Beach-Towel',
        'Trip>Camping:list:Camping-Chair',
      ],
    });
    expect(flat('Trip', source)).toEqual([
      'Trip:Passport',
      'Camping:Chair',
      'Camping:Stove',
    ]);
  });

  it('ignores deleted exceptions and those of deleted includes or lists', () => {
    const base = {
      ...camping,
      includes: ['Trip>Camping@a1'],
      exceptions: ['Trip>Camping:item:Camping-Chair'],
    };
    const all = ['Trip:Passport', 'Camping:Chair', 'Camping:Stove'];
    expect(
      flat(
        'Trip',
        space({ ...base, deletedRows: ['Trip>Camping:item:Camping-Chair'] }),
      ),
    ).toEqual(all);
    expect(
      flat('Trip', space({ ...base, deletedRows: ['Trip>Camping'] })),
    ).toEqual(['Trip:Passport']);
  });

  it('does nothing while the include leads to a list in the trash, even on another path', () => {
    const rows = {
      lists: ['Weekend', 'Camping', 'Beach', 'Toiletries'],
      items: ['Toiletries:Brush@a0'],
      includes: [
        'Weekend>Camping@a1',
        'Weekend>Beach@a2',
        'Camping>Toiletries@a0',
        'Beach>Toiletries@a0',
      ],
      exceptions: ['Weekend>Camping:list:Toiletries'],
    };
    expect(flat('Weekend', space(rows))).toEqual([]);
    expect(
      flat('Weekend', space({ ...rows, deletedLists: ['Camping'] })),
    ).toEqual(['Toiletries:Brush']);
  });

  it('does nothing once the target is no longer below the include, and applies again when it is', () => {
    const rows = {
      lists: ['Weekend', 'Camping', 'Beach', 'Toiletries'],
      items: ['Toiletries:Brush@a0'],
      includes: [
        'Weekend>Camping@a1',
        'Weekend>Beach@a2',
        'Camping>Toiletries@a0',
        'Beach>Toiletries@a0',
      ],
      exceptions: ['Weekend>Camping:item:Toiletries-Brush'],
    };
    const moved = space({ ...rows, deletedRows: ['Camping>Toiletries'] });
    expect(flat('Weekend', moved)).toEqual(['Toiletries:Brush']);
    expect(
      flattenEntries('Weekend', moved).some((e) => e.kind === 'leftOut'),
    ).toBe(false);
    expect(flat('Weekend', space(rows))).toEqual([]);
  });

  it("never hides the viewed list's own items through a re-wired include", () => {
    // A > B once led to R, and the exception left out R's item; now R includes A instead.
    const source = space({
      lists: ['R', 'A', 'B'],
      items: ['R:Own@a0', 'B:Other@a0'],
      includes: ['R>A@a1', 'A>B@a0'],
      exceptions: ['A>B:item:R-Own'],
    });
    expect(flat('R', source)).toEqual(['R:Own', 'B:Other']);
  });

  it('takes the nearest exception whose target is below its include', () => {
    // Trip > Camping names Sleep but no longer leads to it; Beach > Sleep still does.
    const source = space({
      ...camping,
      includes: ['Trip>Camping@a1', 'Trip>Beach@a2', 'Beach>Sleep@a1'],
      exceptions: ['Trip>Camping:list:Sleep', 'Beach>Sleep:item:Sleep-Bag'],
    });
    expect(flattenEntries('Trip', source)).toContainEqual(
      expect.objectContaining({
        kind: 'leftOut',
        ownerListId: 'Beach',
        exception: expect.objectContaining({ includeId: 'Beach>Sleep' }),
      }),
    );
    expect(flat('Trip', source)).not.toContain('Sleep:Bag');
  });

  it('applies again when a deleted include comes back (restored include)', () => {
    const rows = {
      ...camping,
      includes: ['Trip>Camping@a1'],
      exceptions: ['Trip>Camping:item:Camping-Chair'],
    };
    const deleted = space({ ...rows, deletedRows: ['Trip>Camping'] });
    const restored = space(rows);
    expect(flat('Trip', deleted)).not.toContain('Camping:Stove');
    expect(flat('Trip', restored)).toEqual(['Trip:Passport', 'Camping:Stove']);
  });

  it('does not copy left-out items into a run', () => {
    const source = space({
      ...camping,
      includes: ['Trip>Camping@a1'],
      exceptions: ['Trip>Camping:item:Camping-Chair'],
    });
    expect(
      runItemsFromList('Trip', source, () => 'x').map((row) => row.title),
    ).toEqual(['Passport', 'Stove']);
  });

  it('works with a source that has no exceptions', () => {
    const source = space({ ...camping, includes: ['Trip>Camping@a1'] });
    const { exceptionsOf: _unused, ...plain } = source;
    expect(flat('Trip', plain)).toHaveLength(3);
  });
});

describe('wouldCreateCycle', () => {
  const includesOf = (spec: string[], deleted: string[] = []) =>
    space({ lists: [], includes: spec, deletedRows: deleted }).includesOf;

  it('refuses a list including itself', () => {
    expect(wouldCreateCycle('A', 'A', includesOf([]))).toBe(true);
  });

  it('refuses closing a direct or an indirect loop', () => {
    expect(wouldCreateCycle('B', 'A', includesOf(['A>B@a0']))).toBe(true);
    expect(wouldCreateCycle('C', 'A', includesOf(['A>B@a0', 'B>C@a0']))).toBe(
      true,
    );
  });

  it('allows a diamond and unrelated includes', () => {
    const graph = includesOf(['T>H@a0', 'T>C@a1', 'H>X@a0']);
    expect(wouldCreateCycle('C', 'X', graph)).toBe(false);
    expect(wouldCreateCycle('T', 'X', graph)).toBe(false);
  });

  it('ignores deleted includes', () => {
    expect(wouldCreateCycle('B', 'A', includesOf(['A>B@a0'], ['A>B']))).toBe(
      false,
    );
  });

  it('terminates on a graph that already has a cycle', () => {
    const graph = includesOf(['A>B@a0', 'B>A@a0']);
    expect(wouldCreateCycle('C', 'A', graph)).toBe(false);
  });
});

describe('runItemsFromList (what a run copies)', () => {
  const source = space({
    lists: ['trip', 'camp', 'basic'],
    items: ['trip:Tent@a1', 'camp:Stove@a0', 'basic:Lamp@a0', 'trip:Gone@a3'],
    includes: ['trip>camp@a2', 'camp>basic@a1', 'trip>basic@a4'],
    deletedRows: ['Gone'],
  });

  it('copies the flattened items in order, each with its own list as source and a new id', () => {
    let n = 0;
    const items = runItemsFromList('trip', source, () => `id-${++n}`);
    expect(items).toEqual([
      { id: 'id-1', title: 'Tent', quantity: '', note: '', sources: ['trip'] },
      { id: 'id-2', title: 'Stove', quantity: '', note: '', sources: ['camp'] },
      { id: 'id-3', title: 'Lamp', quantity: '', note: '', sources: ['basic'] },
    ]);
  });

  it('copies nothing from an empty list', () => {
    expect(
      runItemsFromList('basic', space({ lists: ['basic'] }), () => 'x'),
    ).toEqual([]);
  });
});
