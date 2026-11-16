import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SyncEngine } from '@lister/web/data-access-sync';
import { InstallPrompt, StoragePersistence } from '@lister/web/util-pwa';
import { FirstUse } from './first-use';

describe('FirstUse', () => {
  it('asks for persistent storage and shows the install hint after the first sync, once', () => {
    const lastSyncedAt = signal<number | null>(null);
    const request = vi.fn(() => Promise.resolve());
    const hintOnce = vi.fn(() => Promise.resolve());
    TestBed.configureTestingModule({
      providers: [
        { provide: SyncEngine, useValue: { lastSyncedAt } },
        { provide: StoragePersistence, useValue: { request } },
        { provide: InstallPrompt, useValue: { hintOnce } },
      ],
    });
    TestBed.inject(FirstUse);

    TestBed.tick();
    expect(request).not.toHaveBeenCalled();

    lastSyncedAt.set(1000);
    TestBed.tick();
    lastSyncedAt.set(2000);
    TestBed.tick();

    expect(request).toHaveBeenCalledTimes(1);
    expect(hintOnce).toHaveBeenCalledTimes(1);
  });
});
