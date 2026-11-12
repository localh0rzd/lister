import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SyncEngine } from '@lister/web/data-access-sync';
import { SyncIndicator } from './sync-indicator';

describe('SyncIndicator', () => {
  it("shows the sync engine's state in the badge", async () => {
    const online = signal(true);
    const pendingCount = signal(0);
    TestBed.configureTestingModule({
      providers: [{ provide: SyncEngine, useValue: { online, pendingCount } }],
    });
    const fixture = TestBed.createComponent(SyncIndicator);
    const text = () =>
      (fixture.nativeElement as HTMLElement)
        .querySelector('.label')
        ?.textContent?.trim() ?? '';
    await fixture.whenStable();
    expect(text()).toBe('');

    pendingCount.set(2);
    await fixture.whenStable();
    expect(text()).toBe('2 changes not synced');

    online.set(false);
    await fixture.whenStable();
    expect(text()).toBe('Offline · 2 changes not synced');

    fixture.componentRef.setInput('compact', true);
    await fixture.whenStable();
    expect(text()).toBe('2');
  });
});
