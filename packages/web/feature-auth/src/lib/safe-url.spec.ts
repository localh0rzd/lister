import { safeReturnUrl } from './safe-url';

describe('safeReturnUrl', () => {
  it.each([
    ['/lists/abc', '/lists/abc'],
    ['/space?x=1', '/space?x=1'],
    [undefined, '/'],
    ['', '/'],
    ['https://evil.example/', '/'],
    ['//evil.example/', '/'],
    ['/\\evil.example', '/'],
    ['lists', '/'],
  ])('%j becomes %j', (url, expected) => {
    expect(safeReturnUrl(url)).toBe(expected);
  });
});
