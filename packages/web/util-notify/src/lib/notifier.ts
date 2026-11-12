import { Service, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

export interface Notice {
  message: string;
  /** Button label, e.g. "Undo" or "Reload". */
  action?: string;
  /**
   * How long it shows, in ms. Leave it out for a sticky notice (e.g. "New version available"),
   * which stays until acted on, steps aside for newer notices and comes back after them.
   */
  duration?: number;
}

/** How a notice ended: its action was used, or it went away. */
export type NoticeOutcome = 'action' | 'dismissed';

interface Queued extends Notice {
  resolve: (outcome: NoticeOutcome) => void;
}

/** Default duration for timed notices such as Undo. */
export const NOTICE_DURATION_MS = 6000;

/**
 * The one way to show snackbars. MatSnackBar shows one at a time and a new one replaces the
 * current one, so an Undo could wipe out another Undo or the update prompt. The notifier queues
 * notices instead: timed ones show one after another; a sticky one shows when nothing else is
 * waiting and returns after interruptions until it's acted on.
 */
@Service()
export class Notifier {
  private readonly snackBar = inject(MatSnackBar);
  private readonly timed: Queued[] = [];
  private sticky: Queued | undefined;
  private current: { notice: Queued; dismiss: () => void } | undefined;

  /** Shows a notice; resolves when it ends. */
  notify(notice: Notice): Promise<NoticeOutcome> {
    return new Promise((resolve) => {
      const queued: Queued = { ...notice, resolve };
      if (notice.duration === undefined) {
        this.sticky?.resolve('dismissed');
        this.sticky = queued;
      } else {
        this.timed.push(queued);
        // A sticky notice makes way, and comes back when the queue is empty.
        if (this.current?.notice.duration === undefined)
          this.current?.dismiss();
      }
      if (!this.current) this.showNext();
    });
  }

  private showNext(): void {
    const next = this.timed.shift() ?? this.sticky;
    if (!next) return;
    const ref = this.snackBar.open(next.message, next.action, {
      duration: next.duration,
    });
    let actedOn = false;
    let interrupted = false;
    this.current = {
      notice: next,
      dismiss: () => {
        interrupted = true;
        ref.dismiss();
      },
    };
    ref.onAction().subscribe(() => (actedOn = true));
    ref.afterDismissed().subscribe(() => {
      this.current = undefined;
      if (next === this.sticky) {
        if (actedOn || !interrupted) {
          this.sticky = undefined;
          next.resolve(actedOn ? 'action' : 'dismissed');
        }
      } else {
        next.resolve(actedOn ? 'action' : 'dismissed');
      }
      this.showNext();
    });
  }
}
