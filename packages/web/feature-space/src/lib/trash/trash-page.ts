import { Component, computed, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import {
  CurrentSpace,
  Repositories,
  type TrashEntry,
} from '@lister/web/data-access-local-db';
import { SpaceChanges } from '@lister/web/data-access-sync';

const DAY_MS = 24 * 60 * 60 * 1000;
const time = new Intl.DateTimeFormat('en', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const date = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' });

/** "today 14:02", "yesterday 09:10", "3 Nov 18:45" (in the device's time zone). */
export function whenDeleted(at: number, now = Date.now()): string {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const day =
    at >= startOfToday
      ? 'today'
      : at >= startOfToday - DAY_MS
        ? 'yesterday'
        : date.format(at);
  return `${day} ${time.format(at)}`;
}

/**
 * The trash (reached from Space): lists and items deleted in the last 30 days (D15), newest
 * first, with who deleted them and when. Restore syncs like any other change; a list comes back
 * with its items, which stayed as they were.
 */
@Component({
  selector: 'lister-trash-page',
  imports: [MatButton, MatIcon, RouterLink],
  template: `
    <a class="back" routerLink="..">
      <mat-icon aria-hidden="true">arrow_back</mat-icon>
      Space
    </a>
    <h1 class="page-title">Trash</h1>
    <p class="hint">Deleted lists and items stay here for 30 days.</p>

    @let v = view();
    @if (v.kind === 'loading') {
      <p class="hint">Loading…</p>
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
              [attr.aria-label]="'Restore ' + entry.row.title"
              (click)="restore(entry)"
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

  protected readonly view = computed(() => {
    const space = this.space.state();
    const trash = this.trash();
    if (space.status === 'error' || trash.status === 'error')
      return { kind: 'error' as const };
    if (space.status === 'loading') return { kind: 'loading' as const };
    if (!space.value) return { kind: 'ready' as const, entries: [] };
    if (trash.status === 'loading') return { kind: 'loading' as const };
    return { kind: 'ready' as const, entries: trash.value };
  });

  /** "List · 3 items · deleted by You, today 14:02" or "Item in Beach · deleted by Ben, …". */
  protected describe(entry: TrashEntry): string {
    const what =
      entry.kind === 'list'
        ? `List · ${entry.itemCount === 1 ? '1 item' : `${entry.itemCount} items`}`
        : `Item in ${entry.listTitle}`;
    const at = whenDeleted(entry.row.deletedAt ?? 0);
    return `${what} · deleted by ${this.who(entry.row.updatedBy)}, ${at}`;
  }

  protected async restore(entry: TrashEntry): Promise<void> {
    const restored = await this.changes.apply(
      entry.kind === 'list'
        ? { name: 'list.restore', args: { id: entry.row.id } }
        : { name: 'item.restore', args: { id: entry.row.id } },
    );
    if (restored) this.changes.tell(`Restored “${entry.row.title}”`);
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
