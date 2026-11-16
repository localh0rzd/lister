import {
  MUTATION_NAMES,
  type MutationInput,
} from '@lister/shared/sync-protocol';
import {
  type TitleLookup,
  describeMutation,
  rejectionText,
} from './describe-mutation';

const titles: TitleLookup = {
  list: async (id) => ({ L1: 'Camping', L2: 'Trip' })[id],
  item: async (id) => ({ I1: 'Stove' })[id],
  run: async (id) => ({ R1: 'Weekend' })[id],
  runItem: async (id) => ({ RI1: 'Fuel' })[id],
};

const m = (name: string, args: object) =>
  ({ name, args, spaceId: 's', mutationId: 'm' }) as unknown as MutationInput;

describe('describeMutation', () => {
  it.each([
    [
      m('item.create', { id: 'x', listId: 'L1', title: 'Stove' }),
      'Add item “Stove” to “Camping”',
    ],
    [m('list.create', { id: 'x', title: 'Trip' }), 'Create list “Trip”'],
    [
      m('list.update', { id: 'L1', patch: { title: 'A', note: 'b' } }),
      'Edit list “Camping” (title, note)',
    ],
    [m('list.delete', { id: 'L1' }), 'Delete list “Camping”'],
    [m('item.delete', { id: 'I1' }), 'Delete item “Stove”'],
    [m('item.move', { id: 'I1', position: 'a' }), 'Move item “Stove”'],
    [
      m('include.create', { id: 'x', parentListId: 'L2', childListId: 'L1' }),
      'Include “Camping” in “Trip”',
    ],
    [
      m('runItem.setState', { id: 'RI1', state: 'checked' }),
      'Mark run item “Fuel” as checked',
    ],
    [
      m('run.addItems', { runId: 'R1', items: [] }),
      'Add items to run “Weekend”',
    ],
    [m('item.delete', { id: 'gone' }), 'Delete item (unknown)'],
  ])('describes %j', async (mutation, expected) => {
    expect(await describeMutation(mutation, titles)).toBe(expected);
  });

  it('describes every mutation name', async () => {
    for (const name of MUTATION_NAMES)
      expect(await describeMutation(m(name, {}), titles)).not.toBe('');
  });
});

describe('rejectionText', () => {
  it('joins the change and the reason', () => {
    expect(
      rejectionText({ description: 'Delete list “A”', reason: 'Not found' }),
    ).toBe('Delete list “A” — Not found');
  });

  it('shows only the reason for entries recorded before descriptions existed', () => {
    expect(rejectionText({ reason: 'Not found' })).toBe('Not found');
  });
});
