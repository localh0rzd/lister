import { newId } from '@lister/shared/domain';
import { MUTATION_NAMES, mutationSchema } from './mutations';

const envelope = () => ({ mutationId: newId(), spaceId: newId() });

describe('mutationSchema', () => {
  it('accepts every mutation type with valid arguments', () => {
    const id = newId();
    const valid = [
      { name: 'list.create', args: { id, title: 'Camping' } },
      { name: 'list.update', args: { id, patch: { description: 'Summer' } } },
      { name: 'list.delete', args: { id } },
      { name: 'list.restore', args: { id } },
      {
        name: 'item.create',
        args: { id, listId: newId(), title: 'Tent', position: 'a0' },
      },
      { name: 'item.update', args: { id, patch: { quantity: '2 pairs' } } },
      { name: 'item.move', args: { id, position: 'a0V' } },
      { name: 'item.delete', args: { id } },
      { name: 'item.restore', args: { id } },
    ];

    expect(valid.map((m) => m.name).sort()).toEqual([...MUTATION_NAMES].sort());
    for (const mutation of valid) {
      expect(
        mutationSchema.safeParse({ ...envelope(), ...mutation }).success,
        mutation.name,
      ).toBe(true);
    }
  });

  it('fills in defaults and trims text; empty quantity means 1 (D6)', () => {
    const parsed = mutationSchema.parse({
      ...envelope(),
      name: 'item.create',
      args: {
        id: newId(),
        listId: newId(),
        title: '  Tent  ',
        position: 'a0',
      },
    });

    expect(parsed.args).toMatchObject({
      title: 'Tent',
      quantity: '',
      note: '',
    });
  });

  it.each([
    ['an unknown mutation', { name: 'item.toggle', args: { id: newId() } }],
    ['a missing title', { name: 'list.create', args: { id: newId() } }],
    [
      'a blank title',
      { name: 'list.create', args: { id: newId(), title: '   ' } },
    ],
    [
      'a too long title',
      { name: 'list.create', args: { id: newId(), title: 'x'.repeat(201) } },
    ],
    ['a non-UUIDv7 id', { name: 'list.delete', args: { id: 'abc' } }],
    [
      'a v4 id',
      {
        name: 'list.delete',
        args: { id: '3b241101-e2bb-4255-8caf-4136c566a962' },
      },
    ],
    [
      'an empty patch',
      { name: 'item.update', args: { id: newId(), patch: {} } },
    ],
    [
      'an unknown patch field',
      { name: 'item.update', args: { id: newId(), patch: { checked: true } } },
    ],
    [
      'an unknown argument',
      { name: 'list.delete', args: { id: newId(), hard: true } },
    ],
    [
      'a bad position key',
      { name: 'item.move', args: { id: newId(), position: 'a 0' } },
    ],
    [
      'a too long quantity',
      {
        name: 'item.update',
        args: { id: newId(), patch: { quantity: '9'.repeat(51) } },
      },
    ],
  ])('rejects %s', (_, mutation) => {
    expect(
      mutationSchema.safeParse({ ...envelope(), ...mutation }).success,
    ).toBe(false);
  });

  it('rejects a mutation without its envelope', () => {
    expect(
      mutationSchema.safeParse({ name: 'list.delete', args: { id: newId() } })
        .success,
    ).toBe(false);
  });

  it('gives a readable reason for a blank title', () => {
    const result = mutationSchema.safeParse({
      ...envelope(),
      name: 'list.create',
      args: { id: newId(), title: ' ' },
    });

    expect(result.error?.issues[0]?.message).toBe('A title is required');
  });
});
