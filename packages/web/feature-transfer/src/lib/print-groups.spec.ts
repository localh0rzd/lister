import {
  type Include,
  type Item,
  type List,
  newId,
} from '@lister/shared/domain';
import { printGroupsOfList } from './print-groups';

const meta = {
  spaceId: 's',
  version: 1,
  deletedAt: null as number | null,
  createdBy: 'u',
  updatedBy: 'u',
  createdAt: 0,
  updatedAt: 0,
};

function space() {
  const lists = new Map<string, List>();
  const items: Item[] = [];
  const includes: Include[] = [];
  let n = 0;
  const position = () => String.fromCharCode(97 + n++);
  return {
    list(title: string, deleted = false) {
      const id = newId();
      lists.set(id, {
        ...meta,
        id,
        title,
        description: '',
        colour: null,
        icon: null,
        deletedAt: deleted ? 1 : null,
      });
      return id;
    },
    item(listId: string, title: string) {
      items.push({
        ...meta,
        id: newId(),
        listId,
        title,
        quantity: '',
        note: '',
        position: position(),
      });
    },
    include(parentListId: string, childListId: string) {
      includes.push({
        ...meta,
        id: newId(),
        parentListId,
        childListId,
        position: position(),
      });
    },
    source: {
      list: (id: string) => lists.get(id),
      itemsOf: (id: string) => items.filter((i) => i.listId === id),
      includesOf: (id: string) => includes.filter((i) => i.parentListId === id),
    },
  };
}

describe('printGroupsOfList', () => {
  it('prints own items first, then each included list under its heading, once', () => {
    const s = space();
    const top = s.list('Top');
    const a = s.list('A');
    const b = s.list('B');
    const shared = s.list('Shared');
    const gone = s.list('Gone', true);
    s.item(top, 'Tent');
    s.include(top, a);
    s.include(top, b);
    s.include(top, gone);
    s.item(top, 'Stove');
    s.include(a, shared);
    s.include(b, shared);
    s.item(a, 'Soap');
    s.item(shared, 'Passport');
    s.item(gone, 'Ghost');

    const groups = printGroupsOfList(top, s.source);

    expect(groups.map((g) => [g.title, g.items.map((i) => i.title)])).toEqual([
      [null, ['Tent', 'Stove']],
      ['A', ['Soap']],
      ['Shared', ['Passport']],
      ['B', []],
    ]);
  });

  it('prints nothing for an empty list', () => {
    const s = space();
    expect(printGroupsOfList(s.list('Empty'), s.source)).toEqual([]);
  });
});
