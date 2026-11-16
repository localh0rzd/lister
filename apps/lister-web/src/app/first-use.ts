import { Service, effect, inject } from '@angular/core';
import { SyncEngine } from '@lister/web/data-access-sync';
import { InstallPrompt, StoragePersistence } from '@lister/web/util-pwa';

/**
 * "First real use" (design §2.6): the user is signed in and the first sync has finished, so
 * there is data on the device worth keeping. Then the app asks the browser to keep its storage
 * and, on iOS Safari, explains how to add it to the home screen. The sync position is stored,
 * so a refused persistence request is repeated at every start.
 */
@Service()
export class FirstUse {
  private readonly sync = inject(SyncEngine);
  private readonly storage = inject(StoragePersistence);
  private readonly install = inject(InstallPrompt);
  private done = false;

  constructor() {
    effect(() => {
      if (this.done || this.sync.lastSyncedAt() === null) return;
      this.done = true;
      void this.storage.request();
      void this.install.hintOnce();
    });
  }
}
