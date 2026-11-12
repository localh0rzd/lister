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
  settle: (outcome: NoticeOutcome) => void;
}

/** Default duration for timed notices such as Undo. */
export const NOTICE_DURATION_MS = 6000;

/** A timed notice shows at least this long before a newer one replaces it. */
export const MIN_NOTICE_MS = 1500;

/**
 * The one way to show snackbars. MatSnackBar shows one at a time and a new one replaces the
 * current one, so an Undo could wipe out another Undo or the update prompt. The notifier queues
 * notices instead:
 *
 * - Timed notices show in order. A newer one cuts the current one short once that has shown for
 *   `MIN_NOTICE_MS`, so the latest action's Undo or a refusal arrives quickly and no notice is
 *   lost.
 * - A sticky notice shows when nothing else is waiting and comes back after interruptions until
 *   it's acted on or swiped away. A newer sticky notice replaces an older one at once.
 */
@Service()
export class Notifier {
  private readonly snackBar = inject(MatSnackBar);
  private readonly timed: Queued[] = [];
  private sticky: Queued | undefined;
  private current:
    { notice: Queued; shownAt: number; interrupt: () => void } | undefined;
  private cutShort?: ReturnType<typeof setTimeout>;

  /** Shows a notice; resolves when it ends. */
  notify(notice: Notice): Promise<NoticeOutcome> {
    return new Promise((resolve) => {
      let settled = false;
      const queued: Queued = {
        ...notice,
        settle: (outcome) => {
          if (settled) return;
          settled = true;
          resolve(outcome);
        },
      };

      if (notice.duration === undefined) {
        const replaced = this.sticky;
        this.sticky = queued;
        replaced?.settle('dismissed');
        if (replaced && this.current?.notice === replaced)
          this.current.interrupt();
      } else {
        this.timed.push(queued);
        const current = this.current;
        if (current?.notice.duration === undefined) {
          current?.interrupt(); // a sticky notice makes way and comes back later
        } else if (current) {
          this.cutShortLater(current);
        }
      }
      if (!this.current) this.showNext();
    });
  }

  /** Interrupts `notice` once it has shown for `MIN_NOTICE_MS`. */
  private cutShortLater(notice: NonNullable<Notifier['current']>): void {
    const wait = Math.max(0, MIN_NOTICE_MS - (Date.now() - notice.shownAt));
    clearTimeout(this.cutShort);
    this.cutShort = setTimeout(() => {
      if (this.current === notice) notice.interrupt();
    }, wait);
  }

  private showNext(): void {
    const next = this.timed.shift() ?? this.sticky;
    if (!next) return;
    const ref = this.snackBar.open(next.message, next.action, {
      duration: next.duration,
    });
    let actedOn = false;
    let interrupted = false;
    const shown = {
      notice: next,
      shownAt: Date.now(),
      interrupt: () => {
        interrupted = true;
        ref.dismiss();
      },
    };
    this.current = shown;
    // Something newer is already waiting: this one only gets the minimum time.
    if (next.duration !== undefined && this.timed.length > 0) {
      this.cutShortLater(shown);
    }
    ref.onAction().subscribe(() => (actedOn = true));
    ref.afterDismissed().subscribe(() => {
      this.current = undefined;
      if (next !== this.sticky) {
        next.settle(actedOn ? 'action' : 'dismissed');
      } else if (actedOn || !interrupted) {
        // Acted on or swiped away: done. Interrupted: it stays and shows again later.
        this.sticky = undefined;
        next.settle(actedOn ? 'action' : 'dismissed');
      }
      this.showNext();
    });
  }
}
