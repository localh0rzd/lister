import { newId } from '@lister/shared/domain';
import {
  MAX_PUSH_MUTATIONS,
  type MutationInput,
} from '@lister/shared/sync-protocol';
import { mutationBytes, nextPushBatch } from './push-batch';

const entry = (title: string) => ({
  mutation: {
    mutationId: newId(),
    spaceId: newId(),
    name: 'list.create',
    args: { id: newId(), title },
  } as MutationInput,
});

describe('nextPushBatch', () => {
  it('sends everything when it fits', () => {
    const pending = [entry('a'), entry('b'), entry('c')];

    expect(nextPushBatch(pending)).toEqual(pending);
  });

  it('stops before the entry that would go over the byte budget', () => {
    const pending = [entry('a'), entry('b'), entry('c')];
    const one = mutationBytes(pending[0].mutation);

    expect(nextPushBatch(pending, one * 2 + 1)).toEqual(pending.slice(0, 2));
  });

  it('always sends the first entry', () => {
    const pending = [entry('x'.repeat(200)), entry('b')];

    expect(nextPushBatch(pending, 10)).toEqual(pending.slice(0, 1));
  });

  it('counts bytes, not characters', () => {
    const ascii = entry('a'.repeat(100));
    const wide = {
      mutation: {
        ...ascii.mutation,
        args: { id: newId(), title: '帐'.repeat(100) },
      } as MutationInput,
    };

    expect(mutationBytes(wide.mutation) - mutationBytes(ascii.mutation)).toBe(
      200,
    );
  });

  it('sends at most MAX_PUSH_MUTATIONS', () => {
    const pending = Array.from({ length: MAX_PUSH_MUTATIONS + 5 }, () =>
      entry('a'),
    );

    expect(nextPushBatch(pending)).toHaveLength(MAX_PUSH_MUTATIONS);
  });
});
