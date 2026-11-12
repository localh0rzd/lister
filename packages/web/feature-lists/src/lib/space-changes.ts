import { Service, inject } from '@angular/core';
import { CurrentSpace } from '@lister/web/data-access-local-db';
import { type MutationRequest, SyncEngine } from '@lister/web/data-access-sync';
import { NOTICE_DURATION_MS, Notifier } from '@lister/web/util-notify';

/** A change in the current space, as the pages ask for it (the space is added here). */
export type SpaceChange = Pick<MutationRequest, 'name' | 'args'>;

/**
 * Sends changes to the current space through the sync engine and shows refusals. Pages use
 * this instead of the engine directly.
 */
@Service()
export class SpaceChanges {
  private readonly space = inject(CurrentSpace);
  private readonly sync = inject(SyncEngine);
  private readonly notifier = inject(Notifier);

  /** `true` when the change was applied locally and queued. */
  async apply(change: SpaceChange): Promise<boolean> {
    const spaceId = this.space.id();
    if (!spaceId) {
      this.tell('Not connected yet: try again in a moment');
      return false;
    }
    const result = await this.sync.mutate({
      ...change,
      spaceId,
    } as MutationRequest);
    if (!result.ok) this.tell(result.reason);
    return result.ok;
  }

  /** Applies a change; if the user taps Undo on the notice, applies `undo`. */
  async withUndo(
    change: SpaceChange,
    message: string,
    undo: SpaceChange,
  ): Promise<void> {
    if (!(await this.apply(change))) return;
    const outcome = await this.notifier.notify({
      message,
      action: 'Undo',
      duration: NOTICE_DURATION_MS,
    });
    if (outcome === 'action') await this.apply(undo);
  }

  private tell(message: string): void {
    void this.notifier.notify({ message, duration: NOTICE_DURATION_MS });
  }
}
