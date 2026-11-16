import {
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import {
  CurrentSpace,
  Repositories,
  type TrashEntry,
  trashedAt,
  trashedBy,
} from '@lister/web/data-access-local-db';
import { SpaceChanges } from '@lister/web/data-access-sync';
import { TRASH_KEEP_DAYS } from '@lister/shared/domain';
import { LoadingHint } from '@lister/web/ui';

const time = new Intl.DateTimeFormat('en', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const date = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' });

/**
 * "today 14:02", "yesterday 09:10", "Nov 3 18:45" (in the device's time zone; calendar days, so
 * daylight-saving changes don't shift "yesterday").
 */
export function whenDeleted(at: number, now = Date.now()): string {
  const today = new Date(now);
  const startOfToday = new Date(today).setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - 1,
  ).getTime();
  const day =
    at >= startOfToday
      ? 'today'
      : at >= startOfYesterday
        ? 'yesterday'
        : date.format(at);
  return `${day} ${time.format(at)}`;
}

/**
 * The trash (reached from Space): lists and items deleted, and runs finished (D10), in the last
 * `TRASH_KEEP_DAYS` (D15), newest first, with who deleted or finished them and when. Restore
 * syncs like any other change; a list comes back with its items, which stayed as they were.
 */
@Component({
  selector: 'lister-trash-page',
  imports: [LoadingHint, MatButton, MatIcon, RouterLink],
  templateUrl: './trash-page.html',
  styleUrl: './trash-page.scss',
})
export class TrashPage {
  private readonly space = inject(CurrentSpace);
  private readonly repositories = inject(Repositories);
  private readonly changes = inject(SpaceChanges);

  private readonly trash = this.repositories.trashOfSpace(this.space.id);
  private readonly userId = this.repositories.currentUserId();
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly keepDays = TRASH_KEEP_DAYS;

  /** A restored entry: once it has left the list, the focus goes to the row now at `index`. */
  private readonly refocus = signal<{ id: string; index: number } | null>(null);

  protected readonly view = computed(() => {
    const space = this.space.state();
    const trash = this.trash();
    if (space.status === 'error' || trash.status === 'error')
      return { kind: 'error' as const };
    if (space.status === 'loading') return { kind: 'loading' as const };
    if (!space.value) return { kind: 'no-space' as const };
    if (trash.status === 'loading') return { kind: 'loading' as const };
    return { kind: 'ready' as const, entries: trash.value };
  });

  constructor() {
    // The restored row's button disappears with the row, which would drop the focus to the
    // page: hand it to the next row's Restore (or the previous one, or the heading).
    afterRenderEffect(() => {
      const target = this.refocus();
      const view = this.view();
      if (!target || view.kind !== 'ready') return;
      if (view.entries.some((entry) => entry.row.id === target.id)) return;
      this.refocus.set(null);
      const host = this.host.nativeElement;
      const buttons = [...host.querySelectorAll<HTMLElement>('button.restore')];
      const next =
        buttons[Math.min(target.index, buttons.length - 1)] ??
        host.querySelector<HTMLElement>('h1');
      next?.focus();
    });
  }

  /**
   * "List · 3 items · deleted by you, today 14:02" (plus "· 1 more deleted item" for items deleted
   * on their own), "Item in Beach · deleted by Ben, …" or "Finished run · 5 items · finished by
   * you, …".
   */
  protected describe(entry: TrashEntry): string {
    const items = (n: number) => (n === 1 ? '1 item' : `${n} items`);
    const at = whenDeleted(trashedAt(entry));
    const by = this.who(trashedBy(entry));
    switch (entry.kind) {
      case 'run':
        return `Finished run · ${items(entry.items)} · finished by ${by}, ${at}`;
      case 'item':
        return `Item in ${entry.listTitle} · deleted by ${by}, ${at}`;
      case 'list': {
        // Items deleted on their own stay deleted; they show here once the list is back.
        const more =
          entry.deletedItemCount > 0
            ? ` · ${entry.deletedItemCount} more deleted ${entry.deletedItemCount === 1 ? 'item' : 'items'}`
            : '';
        return `List · ${items(entry.itemCount)}${more} · deleted by ${by}, ${at}`;
      }
    }
  }

  protected async restore(entry: TrashEntry, index: number): Promise<void> {
    const restored = await this.changes.apply(
      entry.kind === 'list'
        ? { name: 'list.restore', args: { id: entry.row.id } }
        : entry.kind === 'run'
          ? { name: 'run.restore', args: { id: entry.row.id } }
          : { name: 'item.restore', args: { id: entry.row.id } },
    );
    if (!restored) return;
    this.refocus.set({ id: entry.row.id, index });
    this.changes.tell(`Restored “${entry.row.title}”`);
  }

  private who(userId: string): string {
    const user = this.userId();
    if (user.status === 'ready' && user.value === userId) return 'you';
    const space = this.space.state();
    const member =
      space.status === 'ready'
        ? space.value?.members.find((m) => m.userId === userId)
        : undefined;
    return member?.displayName ?? 'someone';
  }
}
