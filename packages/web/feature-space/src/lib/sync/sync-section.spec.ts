import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SyncEngine, type SyncError } from '@lister/web/data-access-sync';
import { CONNECTING_HINT_MS, SyncSection } from './sync-section';

function setup() {
  const engine = {
    online: signal(true),
    syncing: signal(false),
    pendingCount: signal(0),
    lastSyncedAt: signal<number | null>(null),
    signInRequired: signal(false),
    updateRequired: signal(false),
    errorLog: signal<readonly SyncError[]>([]),
    syncNow: vi.fn(() => Promise.resolve()),
    clearErrorLog: vi.fn(() => Promise.resolve()),
  };
  TestBed.configureTestingModule({
    providers: [{ provide: SyncEngine, useValue: engine }],
  });
  const fixture = TestBed.createComponent(SyncSection);
  const element = fixture.nativeElement as HTMLElement;
  const text = () => element.textContent?.replace(/\s+/g, ' ') ?? '';
  const button = (name: string) =>
    [...element.querySelectorAll('button')].find((b) =>
      b.textContent?.includes(name),
    ) as HTMLButtonElement;
  return { engine, fixture, element, text, button };
}

describe('SyncSection', () => {
  it('says it is online, synced, and never synced yet', async () => {
    const { fixture, text } = setup();
    await fixture.whenStable();

    expect(text()).toContain('Online');
    expect(text()).toContain('All changes synced');
    expect(text()).toContain('Last synced: never');
  });

  it('shows offline, the number of unsynced changes and the last sync time', async () => {
    const { engine, fixture, text } = setup();
    engine.online.set(false);
    engine.pendingCount.set(3);
    engine.lastSyncedAt.set(Date.UTC(2026, 0, 2, 12, 0));
    await fixture.whenStable();

    expect(text()).toContain('Offline');
    expect(text()).toContain('3 changes not synced');
    expect(text()).toMatch(/Last synced: \w{3} \d+, 2026/);
  });

  it.each([
    ['signInRequired', 'Signed out: sign in to sync'],
    ['updateRequired', 'Update required'],
  ] as const)('says so when %s', async (flag, expected) => {
    const { engine, fixture, text } = setup();
    engine[flag].set(true);
    await fixture.whenStable();

    expect(text()).toContain(expected);
  });

  it('syncs now on request, but not while syncing or when an update is required', async () => {
    const { engine, fixture, button } = setup();
    await fixture.whenStable();
    button('Sync now').click();
    expect(engine.syncNow).toHaveBeenCalledTimes(1);

    engine.syncing.set(true);
    await fixture.whenStable();
    expect(button('Sync now').disabled).toBe(true);

    engine.syncing.set(false);
    engine.updateRequired.set(true);
    await fixture.whenStable();
    expect(button('Sync now').disabled).toBe(true);
  });

  it('says "Connecting…" for a while after "Sync now" while offline', async () => {
    const { engine, fixture, text, button } = setup();
    engine.online.set(false);
    await fixture.whenStable();
    expect(text()).toContain('Offline');

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      button('Sync now').click();
      fixture.detectChanges();
      expect(engine.syncNow).toHaveBeenCalledTimes(1);
      expect(text()).toContain('Connecting…');

      vi.advanceTimersByTime(CONNECTING_HINT_MS);
      fixture.detectChanges();
      expect(text()).toContain('Offline');
      expect(text()).not.toContain('Connecting…');
    } finally {
      vi.useRealTimers();
    }
  });

  it('lists the refused changes, newest first, and can clear them', async () => {
    const { engine, fixture, text, button } = setup();
    await fixture.whenStable();
    expect(text()).toContain('Sync errors (0)');
    expect(text()).toContain('No changes were refused.');

    engine.errorLog.set([
      { mutationId: 'a', reason: 'First problem', at: 1 },
      {
        mutationId: 'b',
        reason: 'Second problem',
        description: 'Add item “Stove” to “Camping”',
        at: 2,
        seen: true,
      },
    ]);
    await fixture.whenStable();
    expect(text()).toContain('Sync errors (2)');
    expect(text()).toContain('Add item “Stove” to “Camping” — Second problem');
    expect(text().indexOf('Second problem')).toBeLessThan(
      text().indexOf('First problem'),
    );

    button('Clear errors').click();
    expect(engine.clearErrorLog).toHaveBeenCalled();
  });
});
