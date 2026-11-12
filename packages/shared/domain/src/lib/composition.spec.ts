import {
  type CompositionSource,
  flatten,
  wouldCreateCycle,
} from './composition';
import type { Include, Item, List } from './entities';

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
