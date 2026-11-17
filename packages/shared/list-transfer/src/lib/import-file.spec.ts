import { LIMITS } from '@lister/shared/domain';
import { buildListExport } from './export-format';
import { listToMarkdown } from './export-markdown';
import { parseImportFile, parseTextList } from './import-file';
import { FakeSpace } from './testing';

describe('parseTextList', () => {
  it('takes the title from the first heading and one item per line', () => {
    expect(
      parseTextList(
        '# Camping\n\n- [ ] Tent\n* [x] Stove\n1. Lamp\n• Pegs\n  \n',
        'x.md',
      ),
    ).toEqual({ title: 'Camping', items: ['Tent', 'Stove', 'Lamp', 'Pegs'] });
  });

  it('drops other headings and keeps identical lines once', () => {
    expect(
      parseTextList('Intro\n## Toiletries\n- Soap\n- soap \n# Second', 'f.md'),
    ).toEqual({ title: 'Toiletries', items: ['Intro', 'Soap'] });
  });

  it.each([
    ['Tent\nStove', 'Packing list.txt', 'Packing list'],
    ['#\nTent', 'My.list.md', 'My.list'],
    ['Tent', '.md', 'Imported list'],
    ['# \u0007 Trip\tnow', 'a.md', 'Trip now'],
  ])('falls back to the file name: %j in %s', (text, name, title) => {
    expect(parseTextList(text, name).title).toBe(title);
  });

  it('cuts a long title to the limit without splitting a character', () => {
    const title = parseTextList(`# ${'🏕️'.repeat(300)}`, 'a.md').title;
    expect([...title].length).toBeLessThanOrEqual(LIMITS.title);
  });

  it('handles Windows line endings and an empty file', () => {
    expect(parseTextList('# A\r\n- x\r\n- y', 'a.md').items).toEqual([
      'x',
      'y',
    ]);
    expect(parseTextList('', 'empty.txt')).toEqual({
      title: 'empty',
      items: [],
    });
  });

  it('reads back what the Markdown export writes', () => {
    const space = new FakeSpace();
    const camping = space.addList('Camping');
    const sub = space.addList('Toiletries');
    space.addItem(camping, 'Tent');
    space.addInclude(camping, sub);
    space.addItem(sub, 'Soap');

    expect(parseTextList(listToMarkdown(camping, space), 'Camping.md')).toEqual(
      { title: 'Camping', items: ['Tent', 'Soap'] },
    );
  });
});

describe('parseImportFile', () => {
  it('reads .md and .txt as a list, ignoring a byte order mark', () => {
    expect(parseImportFile('a.TXT', '﻿# T\nx')).toEqual({
      kind: 'text',
      title: 'T',
      items: ['x'],
    });
  });

  it('reads .json as a Lister export', () => {
    const space = new FakeSpace();
    const id = space.addList('Camping');
    const json = JSON.stringify(buildListExport([id], space));
    const result = parseImportFile('camping.json', json);
    expect(result.kind).toBe('lists');
  });

  it('reports an invalid .json file as an error', () => {
    expect(parseImportFile('a.json', '{"format":"other"}')).toEqual({
      kind: 'error',
      message: "This isn't a Lister export",
    });
  });
});
