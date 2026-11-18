import type { RunItem } from '@lister/shared/domain';
import { makeRunItem } from '@lister/shared/testing';
import { layoutRun, progressText, runTitle } from './run-sections';

const item = (
  id: string,
  sources: string[],
  state: RunItem['state'] = 'unchecked',
): RunItem => makeRunItem({ id, runId: 'r', title: id, sources, state });
const titles: Record<string, string> = { camp: 'Camping', basic: 'Basics' };
const listTitle = (id: string) => titles[id];
const shape = (layout: ReturnType<typeof layoutRun>) => ({
  sections: layout.sections.map((s) => [s.title, s.rows.map((r) => r.item.id)]),
  done: layout.done.map((r) => r.item.id),
});

describe('layoutRun', () => {
  it('groups by first source, in order of first appearance, typed-in items last only if they come last', () => {
    const layout = layoutRun(
      [
        item('Tent', ['camp']),
        item('Milk', []),
        item('Lamp', ['basic', 'camp']),
        item('Stove', ['camp']),
      ],
      listTitle,
      false,
    );
    expect(shape(layout)).toEqual({
      sections: [
        ['Camping', ['Tent', 'Stove']],
        ['Added to this run', ['Milk']],
        ['Basics', ['Lamp']],
      ],
      done: [],
    });
    expect(layout.sections[2].rows[0].alsoFrom).toEqual(['Camping']);
  });

  it('has no header when every item was typed in', () => {
    expect(shape(layoutRun([item('Milk', [])], listTitle, false))).toEqual({
      sections: [[null, ['Milk']]],
      done: [],
    });
  });

  it('names a list that is gone "Deleted list"', () => {
    const layout = layoutRun(
      [item('Tent', ['gone'], 'checked')],
      listTitle,
      false,
    );
    expect(layout.sections[0].title).toBe('Deleted list');
  });

  it.each([
    [false, { sections: [['Camping', ['A', 'B', 'C']]], done: [] }],
    [true, { sections: [['Camping', ['B']]], done: ['A', 'C'] }],
  ])(
    'with the Done section %s, places checked and skipped items accordingly',
    (on, expected) => {
      const layout = layoutRun(
        [
          item('A', ['camp'], 'checked'),
          item('B', ['camp']),
          item('C', ['camp'], 'skipped'),
        ],
        listTitle,
        on,
      );
      expect(shape(layout)).toEqual(expected);
      expect(layout.progress).toEqual({ done: 2, total: 3 });
    },
  );

  it('is empty for a run without items', () => {
    expect(layoutRun([], listTitle, true)).toEqual({
      sections: [],
      done: [],
      progress: { done: 0, total: 0 },
    });
  });
});

describe('runTitle and progressText', () => {
  const day = new Date(2026, 10, 12);
  it.each([
    ['Alps trip', 'Alps trip · 12 Nov 2026'],
    [null, '12 Nov 2026'],
  ])('titles a run from %j as %j', (list, title) => {
    expect(runTitle(list, day)).toBe(title);
  });

  it.each([
    [{ done: 0, total: 0 }, 'No items yet'],
    [{ done: 3, total: 10 }, '3 of 10 done'],
  ])('describes %j as %j', (progress, text) => {
    expect(progressText(progress)).toBe(text);
  });
});
