import { TestBed } from '@angular/core/testing';
import { SyncBadge } from './sync-badge';

async function render(online: boolean, pendingCount: number, compact = false) {
  const fixture = TestBed.createComponent(SyncBadge);
  fixture.componentRef.setInput('online', online);
  fixture.componentRef.setInput('pendingCount', pendingCount);
  fixture.componentRef.setInput('compact', compact);
  await fixture.whenStable();
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
});
