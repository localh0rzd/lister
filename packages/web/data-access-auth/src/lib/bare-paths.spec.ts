import { isBarePath } from './bare-paths';

describe('isBarePath', () => {
  it.each([
    ['/sign-in', true],
    ['/sign-in?returnUrl=%2Flists', true],
    ['/setup#x', true],
    ['/register?token=ABCD1234WXYZ', true],
    ['/change-password', true],
    ['/lists', false],
    ['/space/sign-in', false],
    ['/sign-in/extra', false],
  ])('%s is %s', (url, expected) => {
    expect(isBarePath(url)).toBe(expected);
  });
});
