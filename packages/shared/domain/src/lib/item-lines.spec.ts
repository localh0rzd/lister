import { cleanItemLines } from './item-lines';

describe('cleanItemLines', () => {
  it.each([
    ['', []],
    ['   \n\n \t ', []],
    ['Tent', ['Tent']],
    ['  Tent  \n\n  Stove ', ['Tent', 'Stove']],
    ['Tent\r\nStove\rLamp', ['Tent', 'Stove', 'Lamp']],
    ['- Tent\n* Stove\n• Lamp', ['Tent', 'Stove', 'Lamp']],
    ['1. Tent\n2) Stove\n10. Lamp', ['Tent', 'Stove', 'Lamp']],
    ['[ ] Tent\n[x] Stove\n[X] Lamp', ['Tent', 'Stove', 'Lamp']],
    ['- [ ] Tent\n  - [x]   Stove', ['Tent', 'Stove']],
    ['[ ]\n-\n- \n* \n1.', []],
    ['-\n- Tent', ['Tent']],
    ['Tent\t1\nStove\t\t\t2 pairs\t', ['Tent 1', 'Stove 2 pairs']],
    ['- Tent\t\n\tTent', ['Tent']],
    ['Tent\n tent \nTENT\nStove', ['Tent', 'Stove']],
    ['- Tent\nTent', ['Tent']],
    ['-5 degrees\n2024 plan\n*bold*', ['-5 degrees', '2024 plan', '*bold*']],
    ['Zelt ☺\nÄpfel\näpfel', ['Zelt ☺', 'Äpfel']],
  ])('cleans %j', (text, expected) => {
    expect(cleanItemLines(text)).toEqual(expected);
  });
});
