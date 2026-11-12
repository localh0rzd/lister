import { EnvironmentInjector, Service, effect, inject } from '@angular/core';
import { NOTICE_DURATION_MS, Notifier } from '@lister/web/util-notify';
import { SyncEngine } from './sync-engine';

/**
 * Shows every change the server refused as a snackbar with its reason, once per tab, and then
 * dismisses it, so it isn't shown again after a reload or in other tabs (design §2.4: invalid
 * changes are rejected with a notice). The change itself was already rolled back by the engine.
 */
@Service()
export class RejectionNotices {
  private readonly engine = inject(SyncEngine);
  private readonly notifier = inject(Notifier);
  private readonly injector = inject(EnvironmentInjector);
  private readonly shown = new Set<string>();
  private started = false;

  /** Starts the engine too. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.engine.start();
    effect(
      () => {
        for (const error of this.engine.errors()) {
          if (this.shown.has(error.mutationId)) continue;
          this.shown.add(error.mutationId);
          void this.notifier
            .notify({
              message: `Change not saved: ${error.reason}`,
              action: 'OK',
              duration: NOTICE_DURATION_MS,
            })
            .then(() => this.engine.dismissError(error.mutationId));
        }
      },
      { injector: this.injector },
    );
  }
}
