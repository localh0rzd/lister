import {
  CHALLENGE_LIFETIME_MS,
  ChallengeStore,
  MAX_PENDING_CHALLENGES,
} from './challenge-store';

describe('ChallengeStore', () => {
  it('accepts an issued challenge once', () => {
    const store = new ChallengeStore();
    store.issue('c1', 'u1', 0);
    expect(store.consume('c1', 'u1', 1)).toBe(true);
    expect(store.consume('c1', 'u1', 2)).toBe(false);
  });

  it('refuses unknown challenges', () => {
    expect(new ChallengeStore().consume('nope', undefined, 0)).toBe(false);
  });

  it('refuses a challenge after it has expired', () => {
    const store = new ChallengeStore();
    store.issue('c1', 'u1', 0);
    expect(store.consume('c1', 'u1', CHALLENGE_LIFETIME_MS)).toBe(false);
  });

  it('refuses another owner, and the wrong answer uses the challenge up', () => {
    const store = new ChallengeStore();
    store.issue('c1', 'u1', 0);
    expect(store.consume('c1', 'u2', 1)).toBe(false);
    expect(store.consume('c1', 'u1', 2)).toBe(false);
    store.issue('c2', undefined, 0);
    expect(store.consume('c2', 'u1', 1)).toBe(false);
  });

  it('keeps no more than the cap, dropping the oldest', () => {
    const store = new ChallengeStore();
    for (let i = 0; i < MAX_PENDING_CHALLENGES + 1; i++) {
      store.issue(`c${i}`, undefined, 0);
    }
    expect(store.consume('c0', undefined, 1)).toBe(false);
    expect(store.consume(`c${MAX_PENDING_CHALLENGES}`, undefined, 1)).toBe(
      true,
    );
  });

  it('forgets expired challenges as new ones come in', () => {
    const store = new ChallengeStore(10);
    store.issue('old', undefined, 0);
    store.issue('new', undefined, 100);
    expect(store.consume('old', undefined, 5)).toBe(false);
    expect(store.consume('new', undefined, 101)).toBe(true);
  });
});
