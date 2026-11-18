import {
  type DiagnosticEntry,
  MAX_AGE_MS,
  MAX_ENTRIES,
} from './diagnostic-entry';
import { DiagnosticStore } from './diagnostic-store';

const NOW = Date.UTC(2026, 10, 18);
const entry = (at: number, event = 'e'): DiagnosticEntry => ({
  at,
  area: 'app',
  event,
  tab: 't',
  leader: false,
});

let store: DiagnosticStore;
beforeEach(async () => {
  store = new DiagnosticStore();
  await store.clear();
});
afterEach(() => store.close());

describe('DiagnosticStore', () => {
  it('keeps entries in time order', async () => {
    await store.append([entry(NOW - 1, 'b'), entry(NOW - 5, 'a')], NOW);
    expect((await store.all()).map((e) => e.event)).toEqual(['a', 'b']);
  });

  it('drops entries older than seven days', async () => {
    await store.append(
      [entry(NOW - MAX_AGE_MS - 1, 'old'), entry(NOW - 10, 'new')],
      NOW,
    );
    expect((await store.all()).map((e) => e.event)).toEqual(['new']);
  });

  it('keeps only the newest MAX_ENTRIES', async () => {
    const entries = Array.from({ length: MAX_ENTRIES + 25 }, (_, i) =>
      entry(NOW - 100_000 + i, `e${i}`),
    );
    await store.append(entries, NOW);
    const kept = await store.all();
    expect(kept).toHaveLength(MAX_ENTRIES);
    expect(kept[0]?.event).toBe('e25');
    expect(kept.at(-1)?.event).toBe(`e${MAX_ENTRIES + 24}`);
  });

  it('survives a reopen (a reload)', async () => {
    await store.append([entry(NOW, 'kept')], NOW);
    store.close();
    store = new DiagnosticStore();
    expect((await store.all()).map((e) => e.event)).toEqual(['kept']);
  });

  it('clears', async () => {
    await store.append([entry(NOW)], NOW);
    await store.clear();
    expect(await store.count()).toBe(0);
  });
});
