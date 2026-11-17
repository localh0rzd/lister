import { suggestTitles } from './title-suggestions';

describe('suggestTitles', () => {
  const titles = ['Tent', 'Tent pegs', 'Stent', 'Headlamp', 'Rope'];

  it('offers nothing for empty or blank text', () => {
    expect(suggestTitles(titles, '')).toEqual([]);
    expect(suggestTitles(titles, '   ')).toEqual([]);
  });

  it('matches anywhere in the title, ignoring case', () => {
    expect(suggestTitles(titles, 'LAMP')).toEqual(['Headlamp']);
    expect(suggestTitles(titles, 'ope')).toEqual(['Rope']);
  });

  it('puts titles that start with the text first, then A–Z', () => {
    expect(suggestTitles(titles, 'ten')).toEqual([
      'Tent',
      'Tent pegs',
      'Stent',
    ]);
    expect(suggestTitles(['Zen', 'A zen', 'Zenith', 'Azen'], 'zen')).toEqual([
      'Zen',
      'Zenith',
      'A zen',
      'Azen',
    ]);
  });

  it('offers titles identical by the D16 rule once', () => {
    expect(
      suggestTitles(['Tent', ' tent ', 'TENT', 'Tent pegs'], 'te'),
    ).toEqual(['Tent', 'Tent pegs']);
  });

  it('leaves out titles already in the list or run, ignoring case and spaces', () => {
    expect(suggestTitles(titles, 'ten', [' tent', 'STENT'])).toEqual([
      'Tent pegs',
    ]);
  });

  it('offers at most the limit', () => {
    const many = Array.from({ length: 12 }, (_, i) => `Item ${i}`);
    expect(suggestTitles(many, 'item')).toHaveLength(5);
    expect(suggestTitles(many, 'item', [], 3)).toHaveLength(3);
  });

  it('matches unicode text', () => {
    expect(suggestTitles(['Éclair', 'Crème brûlée'], 'éc')).toEqual(['Éclair']);
  });

  it('is independent of input order', () => {
    expect(suggestTitles([...titles].reverse(), 'ten')).toEqual(
      suggestTitles(titles, 'ten'),
    );
  });
});
