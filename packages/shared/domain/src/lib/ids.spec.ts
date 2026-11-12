import { isId, newId } from './ids';

describe('newId', () => {
  it('creates unique UUIDv7 ids that sort by creation time', () => {
    const created = Array.from({ length: 200 }, () => newId());

    expect(created.every(isId)).toBe(true);
    expect(new Set(created).size).toBe(created.length);
    expect(created).toEqual([...created].sort());
  });

  it.each([
    'not-an-id',
    '',
    42,
    null,
    '3b241101-e2bb-4255-8caf-4136c566a962', // v4
  ])('rejects %j', (value) => {
    expect(isId(value)).toBe(false);
  });
});
