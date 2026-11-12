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
 * The trash (reached from Space): lists and items deleted in the last `TRASH_KEEP_DAYS` (D15), newest
 * first, with who deleted them and when. Restore syncs like any other change; a list comes back
 * with its items, which stayed as they were.
 */
@Component({
  selector: 'lister-trash-page',
  imports: [LoadingHint, MatButton, MatIcon, RouterLink],
  template: `
    <a class="back" routerLink="..">
      <mat-icon aria-hidden="true">arrow_back</mat-icon>
      Space
    </a>
    <!-- A sub-page: always titled (not a .page-title, which phones hide behind the app bar). -->
    <h1 tabindex="-1">Trash</h1>
    <p class="hint">
      Deleted lists and items stay here for {{ keepDays }} days.
    </p>

    @let v = view();
    @if (v.kind === 'loading') {
      <lister-loading-hint />
    } @else if (v.kind === 'no-space') {
      <p class="hint">
        Deleted lists and items appear here once Lister has connected to the
        server.
      </p>
    } @else if (v.kind === 'error') {
      <p class="hint" role="alert">
        Lister can't open its storage on this device. Check that the browser
        allows site data, then reload.
      </p>
    } @else if (v.entries.length === 0) {
      <div class="empty">
        <mat-icon class="empty-icon" aria-hidden="true"
          >delete_outline</mat-icon
        >
        <p>The trash is empty.</p>
      </div>
    } @else {
      <ul class="entries" aria-label="Deleted lists and items">
        @for (entry of v.entries; track entry.row.id) {
          <li class="entry">
            <mat-icon class="kind" aria-hidden="true">{{
              entry.kind === 'list' ? 'checklist' : 'check_box_outline_blank'
            }}</mat-icon>
            <div class="text">
              <span class="title">{{ entry.row.title }}</span>
              <span class="meta">{{ describe(entry) }}</span>
            </div>
            <button
              matButton
              type="button"
              class="restore"
              [attr.aria-label]="'Restore ' + entry.row.title"
              (click)="restore(entry, $index)"
            >
              Restore
            </button>
          </li>
        }
      </ul>
    }
  `,
  styles: `
    :host {
      display: block;
      max-width: 720px;
    }
    .back {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--mat-sys-primary);
      font: var(--mat-sys-label-large);
      text-decoration: none;
      margin-bottom: 8px;
    }
    h1 {
      font: var(--mat-sys-headline-small);
      margin: 0 0 8px;
      outline: none;
    }
    .hint,
    .meta {
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .entries {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .entry {
      display: flex;
      align-items: center;
      gap: 16px;
      min-height: 64px;
      padding-inline: 4px;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .kind {
      color: var(--mat-sys-on-surface-variant);
    }
    .text {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .title {
      font: var(--mat-sys-body-large);
      overflow-wrap: anywhere;
    }
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-top: 48px;
      color: var(--mat-sys-on-surface-variant);
    }
    .empty-icon {
      width: 48px;
      height: 48px;
      font-size: 48px;
    }
  `,
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
   * on their own), or "Item in Beach · deleted by Ben, …".
   */
  protected describe(entry: TrashEntry): string {
    const items = (n: number) => (n === 1 ? '1 item' : `${n} items`);
    const what =
      entry.kind === 'list'
        ? `List · ${items(entry.itemCount)}` +
          // Items deleted on their own stay deleted; they show here once the list is back.
          (entry.deletedItemCount > 0
            ? ` · ${entry.deletedItemCount} more deleted ${entry.deletedItemCount === 1 ? 'item' : 'items'}`
            : '')
        : `Item in ${entry.listTitle}`;
    const at = whenDeleted(entry.row.deletedAt ?? 0);
    return `${what} · deleted by ${this.who(entry.row.updatedBy)}, ${at}`;
  }

  protected async restore(entry: TrashEntry, index: number): Promise<void> {
    const restored = await this.changes.apply(
      entry.kind === 'list'
        ? { name: 'list.restore', args: { id: entry.row.id } }
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
