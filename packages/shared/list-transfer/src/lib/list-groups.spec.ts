import { groupsOfList } from './list-groups';
import { FakeSpace } from './testing';

describe('groupsOfList', () => {
  it('groups items by their list, own items first, each list once with its depth', () => {
    const space = new FakeSpace();
    const trip = space.addList('Trip');
    const basics = space.addList('Basics');
    const papers = space.addList('Papers');
    const gone = space.addList('Gone', '', true);
    space.addItem(trip, 'Tent');
    space.addInclude(trip, basics);
    space.addItem(trip, 'Stove');
    space.addInclude(trip, papers);
    space.addInclude(trip, gone);
    space.addItem(basics, 'Towel');
    space.addInclude(basics, papers);
    space.addItem(basics, 'Soap');
    space.addItem(papers, 'Passport');
    space.addItem(gone, 'Ghost');

    expect(
      groupsOfList(trip, space).map((group) => ({
        listId: group.listId,
        title: group.title,
        depth: group.depth,
        items: group.items.map((item) => item.title),
      })),
    ).toEqual([
      { listId: trip, title: null, depth: 0, items: ['Tent', 'Stove'] },
      { listId: basics, title: 'Basics', depth: 1, items: ['Towel', 'Soap'] },
      { listId: papers, title: 'Papers', depth: 2, items: ['Passport'] },
    ]);
  });
});
