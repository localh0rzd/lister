import {
  type CompositionSource,
  flatten,
  flattenEntries,
  wouldCreateCycle,
} from './composition';
import type { Include, Item, List } from './entities';
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
  return {
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
  const view = (listId: string, source: CompositionSource) =>
    flattenEntries(listId, source).map((entry) =>
      entry.kind === 'item'
        ? `${'  '.repeat(entry.depth)}${entry.listId}:${entry.item.title}`
        : `${'  '.repeat(entry.depth)}[${entry.include.childListId} ${entry.state}]`,
    );

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
