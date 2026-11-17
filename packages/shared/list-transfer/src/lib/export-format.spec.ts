import { mutationSchema } from '@lister/shared/sync-protocol';
import { newId } from '@lister/shared/domain';
import {
  buildListExport,
  exportFileName,
  importArgs,
  listExportSchema,
} from './export-format';
import { parseListExport } from './import-file';
import { FakeSpace } from './testing';

function trip() {
  const space = new FakeSpace();
  const toiletries = space.addList('Toiletries');
  const shared = space.addList('Basics');
  const trash = space.addList('Old', '', true);
  const camping = space.addList('Camping', 'Summer');
  space.addItem(toiletries, 'Soap', '2', 'small');
  space.addItem(toiletries, 'Basics-like');
  space.addInclude(toiletries, shared);
  space.addItem(shared, 'Passport');
  space.addItem(camping, 'Tent', '1', '');
  space.addInclude(camping, toiletries);
  space.addInclude(camping, trash);
  space.addInclude(camping, shared);
  space.addItem(camping, 'Stove');
  return { space, toiletries, shared, trash, camping };
}

describe('buildListExport', () => {
  it('holds the lists asked for plus every list they include, in order', () => {
    const { space, toiletries, shared, camping } = trip();

    const out = buildListExport([camping], space);

    expect(out.lists.map((l) => l.title)).toEqual([
      'Camping',
      'Toiletries',
      'Basics',
    ]);
    expect(out.lists[0]).toEqual({
      id: camping,
      title: 'Camping',
      description: 'Summer',
      colour: null,
      icon: null,
      entries: [
        { title: 'Tent', quantity: '1', note: '' },
        { include: toiletries },
        { include: shared }, // the list in the trash is left out
        { title: 'Stove', quantity: '', note: '' },
      ],
    });
  });

  it('carries the colour and icon of each list into the file and back into an import', () => {
    const { space, camping, toiletries } = trip();
    const row = space.lists.get(camping);
    if (!row) throw new Error('missing list');
    space.lists.set(camping, { ...row, colour: 'teal', icon: 'camping' });

    const out = buildListExport([camping], space);
    expect(out.lists[0]).toMatchObject({ colour: 'teal', icon: 'camping' });
    expect(out.lists.find((l) => l.id === toiletries)).toMatchObject({
      colour: null,
      icon: null,
    });

    const parsed = parseListExport(JSON.stringify(out));
    if (!parsed.ok) throw new Error('should parse');
    const [copy] = importArgs(parsed.file).lists;
    expect(copy).toMatchObject({ colour: 'teal', icon: 'camping' });
  });

  it('lists a list asked for twice, or reached twice, once', () => {
    const { space, camping, toiletries } = trip();
    const out = buildListExport([camping, toiletries, camping], space);
    expect(out.lists.map((l) => l.title)).toEqual([
      'Camping',
      'Toiletries',
      'Basics',
    ]);
  });

  it('leaves out lists in the trash, deleted items and unknown ids', () => {
    const { space, trash, camping } = trip();
    space.trashItem('Stove');

    const out = buildListExport([trash, newId(), camping], space);

    expect(out.lists.map((l) => l.title)).not.toContain('Old');
    expect(JSON.stringify(out)).not.toContain('Stove');
  });

  it('survives a loop of includes', () => {
    const space = new FakeSpace();
    const a = space.addList('A');
    const b = space.addList('B');
    space.addInclude(a, b);
    space.addInclude(b, a);
    expect(buildListExport([a], space).lists).toHaveLength(2);
  });
});

describe('JSON round trip: export → parse → import', () => {
  it('makes new copies with new ids and includes remapped among them', () => {
    const { space, camping } = trip();
    const exported = buildListExport([camping], space);

    const parsed = parseListExport(JSON.stringify(exported));
    if (!parsed.ok) throw new Error(parsed.message);
    const args = importArgs(parsed.file);

    const originalIds = new Set(exported.lists.map((l) => l.id));
    expect(args.lists.map((l) => l.title)).toEqual([
      'Camping',
      'Toiletries',
      'Basics',
    ]);
    for (const list of args.lists) expect(originalIds).not.toContain(list.id);
    const [campingCopy, toiletriesCopy, basicsCopy] = args.lists;
    expect(
      campingCopy.entries.map((e) => ('listId' in e ? e.listId : e.title)),
    ).toEqual(['Tent', toiletriesCopy.id, basicsCopy.id, 'Stove']);
    expect(campingCopy.description).toBe('Summer');
    expect(toiletriesCopy.entries[0]).toMatchObject({
      title: 'Soap',
      quantity: '2',
      note: 'small',
    });
    // The result is a mutation the protocol accepts.
    expect(
      mutationSchema.safeParse({
        mutationId: newId(),
        spaceId: newId(),
        name: 'list.import',
        args,
      }).success,
    ).toBe(true);
  });

  it('gives every row a different id', () => {
    const { space, camping } = trip();
    const args = importArgs(buildListExport([camping], space));
    const ids = args.lists.flatMap((l) => [
      l.id,
      ...l.entries.map((e) => e.id),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('drops an include of a list that is missing from the file, and repeats', () => {
    const a = newId();
    const b = newId();
    const file = listExportSchema.parse({
      format: 'lister-lists',
      version: 1,
      lists: [
        {
          id: a,
          title: 'A',
          entries: [
            { include: newId() },
            { include: b },
            { include: b },
            { title: 'x' },
          ],
        },
        { id: b, title: 'B', entries: [] },
      ],
    });

    const [first, second] = importArgs(file).lists;

    expect(first.entries).toHaveLength(2);
    expect(first.entries[0]).toMatchObject({ listId: second.id });
    expect(first.entries[1]).toMatchObject({ title: 'x', quantity: '' });
  });
});

describe('parseListExport', () => {
  const valid = {
    format: 'lister-lists',
    version: 1,
    lists: [{ id: newId(), title: 'A', entries: [] }],
  };

  it('accepts a valid export, filling in defaults and trimming text', () => {
    const result = parseListExport(
      JSON.stringify({
        ...valid,
        lists: [
          { ...valid.lists[0], title: '  A  ', entries: [{ title: 'x' }] },
        ],
      }),
    );
    expect(result).toEqual({
      ok: true,
      file: {
        ...valid,
        lists: [
          {
            id: valid.lists[0].id,
            title: 'A',
            description: '',
            colour: null,
            icon: null,
            entries: [{ title: 'x', quantity: '', note: '' }],
          },
        ],
      },
    });
  });

  it('reads a file from before colours and icons, and drops values it does not know', () => {
    const list = { id: newId(), title: 'A', entries: [] };
    const read = (fields: object) =>
      parseListExport(
        JSON.stringify({ ...valid, lists: [{ ...list, ...fields }] }),
      );
    expect(read({})).toMatchObject({
      ok: true,
      file: { lists: [{ colour: null, icon: null }] },
    });
    expect(read({ colour: 'ultraviolet', icon: 'rocket' })).toMatchObject({
      ok: true,
      file: { lists: [{ colour: null, icon: null }] },
    });
    expect(read({ colour: 'red', icon: 'star' })).toMatchObject({
      ok: true,
      file: { lists: [{ colour: 'red', icon: 'star' }] },
    });
  });

  it.each([
    ['not JSON', 'nope', "isn't valid JSON"],
    ['JSON null', 'null', "isn't a Lister export"],
    ['another JSON file', '{"a":1}', "isn't a Lister export"],
    ['a newer version', JSON.stringify({ ...valid, version: 2 }), 'version 2'],
    ['no lists', JSON.stringify({ ...valid, lists: [] }), 'no lists'],
    [
      'a list without a title',
      JSON.stringify({ ...valid, lists: [{ id: newId(), entries: [] }] }),
      'damaged',
    ],
    [
      'an item with a blank title',
      JSON.stringify({
        ...valid,
        lists: [{ id: newId(), title: 'A', entries: [{ title: ' ' }] }],
      }),
      'damaged',
    ],
    [
      'a repeated list id',
      JSON.stringify({ ...valid, lists: [valid.lists[0], valid.lists[0]] }),
      'twice',
    ],
  ])('refuses %s', (_, text, message) => {
    const result = parseListExport(text);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain(message);
  });
});

describe('exportFileName', () => {
  it.each([
    ['Camping', 'json', 'Camping.json'],
    ['a/b: c*?', 'md', 'a b c.md'],
    ['..hidden', 'md', 'hidden.md'],
    ['   ', 'json', 'list.json'],
    ['Reisliste für Zürich 🏕️', 'md', 'Reisliste für Zürich 🏕️.md'],
  ])('names %j as a %s file', (title, extension, expected) => {
    expect(exportFileName(title, extension)).toBe(expected);
  });
});
