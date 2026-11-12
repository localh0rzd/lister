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
  };
}

describe('SyncBadge', () => {
  it.each([
    [true, 0, false, ''],
    [true, 1, false, '1 change not synced'],
    [true, 3, false, '3 changes not synced'],
    [false, 0, false, 'Offline'],
    [false, 2, false, 'Offline · 2 changes not synced'],
    [true, 3, true, '3'],
    [false, 0, true, 'Offline'],
  ])(
    'online=%s pending=%i compact=%s shows %j',
    async (online, pending, compact, text) => {
      expect((await render(online, pending, compact)).label).toBe(text);
    },
  );

  it('is a polite live region, so screen readers hear changes', async () => {
    const { element } = await render(false, 0);

    expect(element.getAttribute('role')).toBe('status');
    expect(element.getAttribute('aria-live')).toBe('polite');
  });
});
