import { TestBed } from '@angular/core/testing';
import { PENDING_GRACE_MS, SyncBadge } from './sync-badge';

afterEach(() => vi.useRealTimers());

/** Renders the badge and lets the grace period pass, like a change that stays pending. */
async function render(online: boolean, pendingCount: number, compact = false) {
  vi.useFakeTimers();
  const fixture = TestBed.createComponent(SyncBadge);
  fixture.componentRef.setInput('online', online);
  fixture.componentRef.setInput('pendingCount', pendingCount);
  fixture.componentRef.setInput('compact', compact);
  fixture.detectChanges();
  vi.advanceTimersByTime(PENDING_GRACE_MS);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  return {
    element,
    label: element.querySelector('.label')?.textContent?.trim() ?? '',
    spoken:
      element.querySelector('.cdk-visually-hidden')?.textContent?.trim() ?? '',
  };
}

describe('SyncBadge', () => {
  it.each([
    [true, 0, false, '', ''],
    [true, 1, false, '1 change not synced', '1 change not synced'],
    [true, 3, false, '3 changes not synced', '3 changes not synced'],
    [false, 0, false, 'Offline', 'Offline'],
    [
      false,
      2,
      false,
      'Offline · 2 changes not synced',
      'Offline · 2 changes not synced',
    ],
    [true, 3, true, '3', '3 changes not synced'],
    [false, 0, true, 'Offline', 'Offline'],
    [false, 2, true, '2', 'Offline · 2 changes not synced'],
  ])(
    'online=%s pending=%i compact=%s shows %j and says %j',
    async (online, pending, compact, shown, spoken) => {
      const badge = await render(online, pending, compact);

      expect(badge.label).toBe(shown);
      expect(badge.spoken).toBe(spoken);
      if (spoken) {
        expect(
          badge.element.querySelector('.label')?.getAttribute('aria-hidden'),
        ).toBe('true');
        expect(
          badge.element.querySelector('.badge')?.getAttribute('title'),
        ).toBe(spoken);
      }
    },
  );

  it('is a polite live region, so screen readers hear changes', async () => {
    const { element } = await render(false, 0);

    expect(element.getAttribute('role')).toBe('status');
    expect(element.getAttribute('aria-live')).toBe('polite');
  });

  describe('online, a change that syncs quickly', () => {
    function start() {
      vi.useFakeTimers();
      const fixture = TestBed.createComponent(SyncBadge);
      fixture.componentRef.setInput('online', true);
      fixture.componentRef.setInput('pendingCount', 0);
      fixture.detectChanges();
      const set = (pending: number) => {
        fixture.componentRef.setInput('pendingCount', pending);
        fixture.detectChanges();
      };
      const text = () =>
        (fixture.nativeElement as HTMLElement).textContent?.trim() ?? '';
      return { fixture, set, text };
    }

    it('never shows the badge when it syncs within the grace period', () => {
      const badge = start();
      badge.set(1);
      vi.advanceTimersByTime(PENDING_GRACE_MS - 1);
      badge.fixture.detectChanges();
      expect(badge.text()).toBe('');

      badge.set(0);
      vi.advanceTimersByTime(PENDING_GRACE_MS);
      badge.fixture.detectChanges();
      expect(badge.text()).toBe('');
    });

    it('shows changes that wait longer, and hides them once synced', () => {
      const badge = start();
      badge.set(2);
      vi.advanceTimersByTime(PENDING_GRACE_MS);
      badge.fixture.detectChanges();
      expect(badge.text()).toContain('2 changes not synced');

      badge.set(0);
      expect(badge.text()).toBe('');
    });

    it('shows pending changes at once while offline', () => {
      const badge = start();
      badge.fixture.componentRef.setInput('online', false);
      badge.set(1);
      expect(badge.text()).toContain('Offline · 1 change not synced');
    });
  });
});
