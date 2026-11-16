import {
  MAX_PUSH_BYTES,
  MAX_PUSH_MUTATIONS,
  type MutationInput,
} from '@lister/shared/sync-protocol';

const encoder = new TextEncoder();

/** How many bytes a mutation takes in a push (UTF-8 JSON). */
export function mutationBytes(mutation: MutationInput): number {
  return encoder.encode(JSON.stringify(mutation)).byteLength;
}

/**
 * The first entries of `pending` that go out in one push: at most `MAX_PUSH_MUTATIONS`, and at
 * most `maxBytes` of mutations, but always the first one (`mutate` refuses a change bigger than
 * the budget, so it fits).
 */
export function nextPushBatch<T extends { mutation: MutationInput }>(
  pending: readonly T[],
  maxBytes = MAX_PUSH_BYTES,
): T[] {
  const batch: T[] = [];
  let bytes = 0;
  for (const entry of pending.slice(0, MAX_PUSH_MUTATIONS)) {
    bytes += mutationBytes(entry.mutation);
    if (batch.length > 0 && bytes > maxBytes) break;
    batch.push(entry);
  }
  return batch;
}
