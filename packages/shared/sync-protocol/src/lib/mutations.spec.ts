import { newId } from '@lister/shared/domain';
import { MAX_PUSH_BYTES } from './messages';
import { MUTATION_NAMES, mutationSchema, parseMutation } from './mutations';

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
      {
        name: 'list.sortItems',
        args: { listId: id, items: [{ id: newId(), position: 'a0' }] },
      },
      {
        name: 'run.sortItems',
        args: { runId: id, items: [{ id: newId(), position: 'a0' }] },
      },
      { name: 'item.update', args: { id, patch: { quantity: '2 pairs' } } },
      { name: 'item.move', args: { id, position: 'a0V' } },
      { name: 'item.delete', args: { id } },
      { name: 'item.restore', args: { id } },
      {
        name: 'run.start',
        args: {
          id,
          title: 'Alps',
          sourceListId: newId(),
          items: [{ id: newId(), title: 'Tent', sources: [newId()] }],
        },
      },
      { name: 'run.update', args: { id, patch: { title: 'Alps 2027' } } },
      { name: 'run.restore', args: { id } },
      {
        name: 'run.addItems',
        args: {
          runId: id,
          items: [{ id: newId(), title: 'Milk', quantity: '2' }],
        },
      },
      {
        name: 'run.saveAsList',
        args: {
          runId: id,
          listId: newId(),
          title: 'Alps gear',
          items: [{ from: newId(), id: newId() }],
        },
      },
      { name: 'runItem.update', args: { id, patch: { note: 'cold' } } },
      { name: 'runItem.move', args: { id, position: 'a1' } },
      { name: 'runItem.remove', args: { id } },
      { name: 'runItem.restore', args: { id } },
      { name: 'runItem.setState', args: { id, state: 'skipped' } },
      {
        name: 'list.duplicate',
        args: {
          id,
          sourceListId: newId(),
          title: 'Copy of Camping',
          items: [{ from: newId(), id: newId() }],
          includes: [],
        },
      },
      {
        name: 'include.create',
        args: {
          id,
          parentListId: newId(),
          childListId: newId(),
          position: 'a1',
        },
      },
      { name: 'include.move', args: { id, position: 'a2' } },
      { name: 'include.delete', args: { id } },
      { name: 'include.restore', args: { id } },
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
      'a malformed position key',
      { name: 'item.move', args: { id: newId(), position: 'a00' } },
    ],
    [
      'an upper-case id',
      { name: 'list.delete', args: { id: newId().toUpperCase() } },
    ],
    [
      'a patch whose values are all undefined',
      {
        name: 'item.update',
        args: { id: newId(), patch: { title: undefined } },
      },
    ],
    [
      'a title with a line break',
      { name: 'list.create', args: { id: newId(), title: 'a\nb' } },
    ],
    [
      'an invisible title',
      { name: 'list.create', args: { id: newId(), title: '\u200b' } },
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

describe('parseMutation', () => {
  it('returns the validated mutation', () => {
    const mutation = {
      ...envelope(),
      name: 'list.delete',
      args: { id: newId() },
    };

    expect(parseMutation(mutation)).toEqual({ ok: true, mutation });
  });

  it('names the mutation and gives a readable reason when it is invalid', () => {
    const mutationId = newId();
    const result = parseMutation({
      mutationId,
      spaceId: newId(),
      name: 'list.create',
      args: { id: newId(), title: ' ' },
    } as { mutationId: string });

    expect(result).toEqual({
      ok: false,
      mutationId,
      reason: 'A title is required',
    });
  });

  it.each([
    [
      'too many items',
      'run.start',
      {
        id: newId(),
        title: 'Trip',
        items: Array.from({ length: 2001 }, () => ({
          id: newId(),
          title: 'x',
        })),
      },
      'Too big: expected array to have <=2000 items',
    ],
    [
      'an id that is not a UUID',
      'list.create',
      { id: 'nope', title: 'A' },
      'Invalid UUID',
    ],
    [
      'an unknown field',
      'list.create',
      { id: newId(), title: 'A', colour: 'red' },
      'Unrecognized key: "colour"',
    ],
  ])('gives Zod’s readable reason for %s', (_, name, args, reason) => {
    const result = parseMutation({ ...envelope(), name, args } as {
      mutationId: string;
    });

    expect(result).toMatchObject({ ok: false, reason });
  });
});

describe('list.create with items', () => {
  const create = (args: object) =>
    mutationSchema.safeParse({
      ...envelope(),
      name: 'list.create',
      args,
    });

  it('defaults to no items, so older clients still work', () => {
    const parsed = create({ id: newId(), title: 'Camping' });
    expect(parsed.success && parsed.data.args).toMatchObject({ items: [] });
  });

  it.each([
    ['a blank title', [{ id: newId(), title: '  ' }]],
    ['an extra field', [{ id: newId(), title: 'Tent', note: 'x' }]],
    [
      'too many items',
      Array.from({ length: 2001 }, () => ({ id: newId(), title: 'x' })),
    ],
  ])('refuses %s', (_, items) => {
    expect(create({ id: newId(), title: 'Camping', items }).success).toBe(
      false,
    );
  });
});

describe('sort mutations', () => {
  const envelope2 = () => ({ mutationId: newId(), spaceId: newId() });
  it.each(['list.sortItems', 'run.sortItems'])(
    '%s refuses no items, bad keys and extra fields',
    (name) => {
      const key = name === 'list.sortItems' ? 'listId' : 'runId';
      const ok = { [key]: newId(), items: [{ id: newId(), position: 'a0' }] };
      const parse = (args: object) =>
        mutationSchema.safeParse({ ...envelope2(), name, args }).success;
      expect(parse(ok)).toBe(true);
      expect(parse({ ...ok, items: [] })).toBe(false);
      expect(parse({ ...ok, items: [{ id: newId(), position: '!' }] })).toBe(
        false,
      );
      expect(parse({ ...ok, extra: 1 })).toBe(false);
    },
  );

  it('keeps every sort under the push byte budget', () => {
    const items = Array.from({ length: 2000 }, () => ({
      id: newId(),
      position: 'a'.repeat(100),
    }));
    const bytes = JSON.stringify({
      ...envelope2(),
      name: 'list.sortItems',
      args: { listId: newId(), items },
    }).length;
    expect(bytes).toBeLessThan(MAX_PUSH_BYTES);
  });

  it('refuses more items than one sort may re-key', () => {
    const items = Array.from({ length: 2001 }, () => ({
      id: newId(),
      position: 'a0',
    }));
    const result = mutationSchema.safeParse({
      ...envelope2(),
      name: 'run.sortItems',
      args: { runId: newId(), items },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      'This has too many items to sort in one step',
    );
  });
});
