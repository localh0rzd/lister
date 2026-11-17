import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import {
  type CompositionSource,
  type Item,
  type List,
  newId,
} from '@lister/shared/domain';
import { SpaceChanges } from '@lister/web/data-access-sync';
import { Notifier } from '@lister/web/util-notify';
import { Transfers } from './transfers';

const meta = {
  spaceId: 's',
  version: 1,
  deletedAt: null,
  createdBy: 'u',
  updatedBy: 'u',
  createdAt: 0,
  updatedAt: 0,
};
const list = (title: string): List => ({
  ...meta,
  id: newId(),
  title,
  description: '',
});
const item = (listId: string, title: string, position = 'a'): Item => ({
  ...meta,
  id: newId(),
  listId,
  title,
  quantity: '2',
  note: '',
  position,
});

const camping = list('Camping / 2026');
const source: CompositionSource = {
  list: (id) => (id === camping.id ? camping : undefined),
  itemsOf: (id) => (id === camping.id ? [item(id, 'Tent')] : []),
  includesOf: () => [],
};

/** jsdom's Blob has no `text()`. */
const blobText = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsText(blob);
  });

describe('Transfers', () => {
  const downloads: { name: string; blob: Blob }[] = [];
  let apply: ReturnType<typeof vi.fn>;
  let tell: ReturnType<typeof vi.fn>;
  let notify: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    downloads.length = 0;
    URL.createObjectURL = vi.fn(
      (blob: Blob) => `blob:${downloads.push({ name: '', blob })}`,
    );
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads[downloads.length - 1].name = this.download;
    });
    apply = vi.fn(async () => true);
    tell = vi.fn();
    notify = vi.fn(async () => 'dismissed');
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SpaceChanges, useValue: { apply, tell } },
        { provide: Notifier, useValue: { notify } },
      ],
    });
    navigate = vi
      .spyOn(TestBed.inject(Router), 'navigate')
      .mockResolvedValue(true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  const file = (name: string, text: string) => ({
    name,
    size: text.length,
    text: async () => text,
  });

  it('downloads a list as Markdown, named after the list', async () => {
    TestBed.inject(Transfers).exportList(camping, 'markdown', source);

    expect(downloads).toHaveLength(1);
    expect(downloads[0].name).toBe('Camping 2026.md');
    expect(await blobText(downloads[0].blob)).toBe(
      '# Camping / 2026\n\n- Tent (2)\n',
    );
  });

  it('downloads a list as a Lister JSON export', async () => {
    TestBed.inject(Transfers).exportList(camping, 'json', source);

    expect(downloads[0].name).toBe('Camping 2026.json');
    expect(JSON.parse(await blobText(downloads[0].blob))).toMatchObject({
      format: 'lister-lists',
      version: 1,
      lists: [{ id: camping.id, entries: [{ title: 'Tent', quantity: '2' }] }],
    });
  });

  it('downloads every given list as one JSON file', async () => {
    TestBed.inject(Transfers).exportAll([camping], source);

    expect(downloads[0].name).toMatch(/^Lister lists \d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(await blobText(downloads[0].blob)).lists).toHaveLength(1);
  });

  it('imports Markdown as one new list through a mutation, and offers to open it', async () => {
    notify.mockResolvedValueOnce('action');

    await TestBed.inject(Transfers).importFile(
      file('trip.md', '# Trip\n- [ ] Tent\n- [x] Stove\n'),
    );

    const [change] = apply.mock.calls[0];
    expect(change).toMatchObject({
      name: 'list.create',
      args: { title: 'Trip', items: [{ title: 'Tent' }, { title: 'Stove' }] },
    });
    expect(navigate).toHaveBeenCalledWith(['/lists', change.args.id]);
  });

  it('imports a Lister export as new copies through one mutation', async () => {
    TestBed.inject(Transfers).exportList(camping, 'json', source);
    const text = await blobText(downloads[0].blob);

    await TestBed.inject(Transfers).importFile(file('camping.json', text));

    const [change] = apply.mock.calls[0];
    expect(change.name).toBe('list.import');
    expect(change.args.lists).toHaveLength(1);
    expect(change.args.lists[0].id).not.toBe(camping.id);
    expect(tell).toHaveBeenCalledWith('Imported 1 list');
  });

  it.each([
    ['not a Lister file', 'a.json', '{"x":1}', "isn't a Lister export"],
    ['broken JSON', 'a.json', '{', "isn't valid JSON"],
  ])('tells and creates nothing for %s', async (_, name, text, message) => {
    await TestBed.inject(Transfers).importFile(file(name, text));

    expect(apply).not.toHaveBeenCalled();
    expect(tell).toHaveBeenCalledWith(expect.stringContaining(message));
  });

  it('tells when the file can’t be read, and creates nothing', async () => {
    const unreadable = {
      name: 'a.md',
      size: 10,
      text: vi.fn().mockRejectedValue(new Error('gone')),
    };

    await TestBed.inject(Transfers).importFile(unreadable);

    expect(tell).toHaveBeenCalledWith("Couldn't read this file");
    expect(apply).not.toHaveBeenCalled();
  });

  it('refuses a file that is too big, without reading it', async () => {
    const big = { name: 'a.md', size: 6 * 1024 * 1024, text: vi.fn() };

    await TestBed.inject(Transfers).importFile(big);

    expect(big.text).not.toHaveBeenCalled();
    expect(tell).toHaveBeenCalledWith('This file is too big to import');
  });

  it('refuses a text file with too many lines', async () => {
    const lines = Array.from({ length: 2001 }, (_, i) => `item ${i}`).join(
      '\n',
    );

    await TestBed.inject(Transfers).importFile(file('long.txt', lines));

    expect(apply).not.toHaveBeenCalled();
    expect(tell).toHaveBeenCalledWith(
      expect.stringContaining('too many lines'),
    );
  });

  it('does not announce an import the sync engine refused', async () => {
    apply.mockResolvedValue(false);

    await TestBed.inject(Transfers).importFile(file('a.md', 'x'));

    expect(notify).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
