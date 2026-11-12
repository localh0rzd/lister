import { displayQuantity, normalizeQuantity } from './quantity';

describe('quantity (D6)', () => {
  it.each([
    ['', '1'],
    ['   ', '1'],
    ['2', '2'],
    [' 2 pairs ', '2 pairs'],
    ['500 g', '500 g'],
  ])('shows %j as %j', (quantity, shown) => {
    expect(displayQuantity(quantity)).toBe(shown);
  });

  it('trims but keeps the free text', () => {
    expect(normalizeQuantity('  ½ cup ')).toBe('½ cup');
  });
});
