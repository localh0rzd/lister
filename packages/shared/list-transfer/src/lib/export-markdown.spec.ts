import { listToMarkdown } from './export-markdown';
import { FakeSpace } from './testing';

describe('listToMarkdown', () => {
  it('writes the title, items with quantity and note, and sections', () => {
    const space = new FakeSpace();
    const camping = space.addList('Camping');
    const toiletries = space.addList('Toiletries');
    space.addItem(camping, 'Tent', '2', 'the big one');
    space.addItem(camping, 'Stove', '500 g');
    space.addItem(camping, 'Lamp', '', 'batteries');
    space.addInclude(camping, toiletries);
    space.addItem(toiletries, 'Soap');

    expect(listToMarkdown(camping, space)).toBe(
      [
        '# Camping',
        '',
        '- Tent (2) — the big one',
        '- Stove (500 g)',
        '- Lamp — batteries',
        '',
        '## Toiletries',
        '',
        '- Soap',
        '',
      ].join('\n'),
    );
  });

  it('shows a list reached twice once, nests deeper lists and skips the trash', () => {
    const space = new FakeSpace();
    const top = space.addList('Top');
    const a = space.addList('A');
    const b = space.addList('B');
    const shared = space.addList('Shared');
    const gone = space.addList('Gone', '', true);
    space.addInclude(top, a);
    space.addInclude(top, b);
    space.addInclude(top, gone);
    space.addInclude(a, shared);
    space.addInclude(b, shared);
    space.addItem(shared, 'Passport');
    space.addItem(gone, 'Ghost');

    const markdown = listToMarkdown(top, space);

    expect(markdown.match(/Passport/g)).toHaveLength(1);
    expect(markdown).toContain('## A\n\n### Shared\n\n- Passport\n\n## B\n');
    expect(markdown).not.toContain('Gone');
    expect(markdown).not.toContain('Ghost');
  });

  it('writes just the title for an empty list', () => {
    const space = new FakeSpace();
    expect(listToMarkdown(space.addList('Empty'), space)).toBe('# Empty\n');
  });
});
