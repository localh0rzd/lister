import { Service, inject } from '@angular/core';
import { CurrentSpace } from '@lister/web/data-access-local-db';
import { type MutationRequest, SyncEngine } from './sync-engine';
import { NOTICE_DURATION_MS, Notifier } from '@lister/web/util-notify';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/** A change in the current space, as the pages ask for it (the space is added here). */
export type SpaceChange = DistributiveOmit<MutationRequest, 'spaceId'>;

/**
 * Sends changes to the current space through the sync engine and shows refusals. Feature pages
 * use this instead of the engine directly.
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

  /**
   * Applies a change; if the user taps Undo on the notice, applies `undo`. Resolves `false` at
   * once when the change isn't applied, otherwise `true` once the notice is gone.
   */
  async withUndo(
    change: SpaceChange,
    message: string,
    undo: SpaceChange,
  ): Promise<boolean> {
    if (!(await this.apply(change))) return false;
    const outcome = await this.notifier.notify({
      message,
      action: 'Undo',
      duration: NOTICE_DURATION_MS,
    });
    if (outcome === 'action') await this.apply(undo);
    return true;
  }

  /** Shows a short notice (e.g. why something wasn't done). */
  tell(message: string): void {
    void this.notifier.notify({ message, duration: NOTICE_DURATION_MS });
  }
}
