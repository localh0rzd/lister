import { trustProxySetting } from './configure-app';

describe('trustProxySetting', () => {
  it.each([
    [undefined, 'loopback, linklocal, uniquelocal'],
    ['  ', 'loopback, linklocal, uniquelocal'],
    ['1', 1],
    ['10.0.0.0/8', '10.0.0.0/8'],
  ])('reads %j as %j', (value, expected) => {
    expect(trustProxySetting(value)).toBe(expected);
  });
});
