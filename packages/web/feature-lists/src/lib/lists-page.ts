import { Component, computed, inject } from '@angular/core';
import { MatFabButton, MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { Router, RouterLink } from '@angular/router';
import {
  LIMITS,
  type List,
  flattenEntries,
  newId,
} from '@lister/shared/domain';
import { CurrentSpace, Repositories } from '@lister/web/data-access-local-db';
import { TitleDialog, type TitleDialogData, LoadingHint } from '@lister/web/ui';
import { SpaceChanges } from '@lister/web/data-access-sync';
import { NOTICE_DURATION_MS, Notifier } from '@lister/web/util-notify';
import { firstValueFrom } from 'rxjs';

/** What a list holds: its own items, all items with included lists, and those lists. */
export interface ListCounts {
  own: number;
  total: number;
  lists: number;
}

/**
 * The Lists destination: every list of the space with its item counts (design §2.7): its own
 * items and, when it includes other lists, the total and how many lists it includes.
 */
@Component({
  selector: 'lister-lists-page',
  imports: [
    LoadingHint,
    MatFabButton,
    MatIcon,
    MatIconButton,
    MatMenu,
    MatMenuItem,
    MatMenuTrigger,
    RouterLink,
  ],
  templateUrl: './lists-page.html',
  styleUrl: './lists-page.scss',
})
export class ListsPage {
  private readonly space = inject(CurrentSpace);
  private readonly repositories = inject(Repositories);
  private readonly changes = inject(SpaceChanges);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(Notifier);
  private readonly router = inject(Router);

  private readonly lists = this.repositories.listsOfSpace(this.space.id);
  private readonly composition = this.repositories.compositionOfSpace(
    this.space.id,
  );

  /** What the page shows. */
  protected readonly view = computed(() => {
    const space = this.space.state();
    if (space.status === 'loading') return { kind: 'loading' as const };
    if (space.status === 'error') return { kind: 'error' as const };
    if (!space.value) return { kind: 'no-space' as const };
    const lists = this.lists();
    if (lists.status === 'error') return { kind: 'error' as const };
    if (lists.status === 'loading') return { kind: 'loading' as const };
    // Counts are extra: if their query fails, the lists still show (with "–").
    const composition = this.composition();
    return {
      kind: 'lists' as const,
      lists: lists.value.map((list) => {
        if (composition.status !== 'ready') return { list, count: null };
        const entries = flattenEntries(list.id, composition.value);
        const count: ListCounts = {
          own: entries.filter((e) => e.kind === 'item' && e.depth === 0).length,
          total: entries.filter((e) => e.kind === 'item').length,
          lists: entries.filter(
            (e) => e.kind === 'section' && e.state === 'live',
          ).length,
        };
        return { list, count };
      }),
    };
  });

  protected async create(): Promise<void> {
    const title = await this.askTitle({
      heading: 'New list',
      confirm: 'Create',
    });
    if (title)
      await this.changes.apply({
        name: 'list.create',
        args: { id: newId(), title },
      });
  }

  protected async rename(list: List): Promise<void> {
    const title = await this.askTitle({
      heading: 'Rename list',
      confirm: 'Rename',
      title: list.title,
    });
    if (title && title !== list.title) {
      await this.changes.apply({
        name: 'list.update',
        args: { id: list.id, patch: { title } },
      });
    }
  }

  protected remove(list: List): Promise<void> {
    return this.changes.withUndo(
      { name: 'list.delete', args: { id: list.id } },
      `Deleted “${list.title}”`,
      { name: 'list.restore', args: { id: list.id } },
    );
  }

  /**
   * Duplicate: a new list "Copy of <title>" with copies of the list's items (same order, new
   * ids) and the same includes (still live references), as one `list.duplicate` change: it
   * appears complete at once, everywhere, and never half-made. Every id comes from this device,
   * so it works offline.
   */
  protected async duplicate(list: List): Promise<void> {
    const composition = this.composition();
    if (composition.status !== 'ready') {
      this.changes.tell(
        "Can't duplicate this list right now: try again in a moment",
      );
      return;
    }
    const source = composition.value;
    const id = newId();
    const title = copyTitle(list.title);
    const created = await this.changes.apply({
      name: 'list.duplicate',
      args: {
        id,
        sourceListId: list.id,
        title,
        items: source
          .itemsOf(list.id)
          .filter((item) => item.deletedAt === null)
          .map((item) => ({ from: item.id, id: newId() })),
        includes: source
          .includesOf(list.id)
          .filter((row) => row.deletedAt === null)
          .map((row) => ({ from: row.id, id: newId() })),
      },
    });
    if (!created) return;
    // Lists are sorted by title, so the copy is usually off-screen: offer a way to it.
    const outcome = await this.notifier.notify({
      message: `Created “${title}”`,
      action: 'Open',
      duration: NOTICE_DURATION_MS,
    });
    if (outcome === 'action') await this.router.navigate(['/lists', id]);
  }

  /** "3 items", or "3 items · 12 in total · 2 lists included" for a list that includes others. */
  protected itemCount(count: ListCounts | null): string {
    if (count === null) return '–';
    const items = (n: number) => (n === 1 ? '1 item' : `${n} items`);
    if (count.lists === 0) return items(count.own);
    const lists = count.lists === 1 ? '1 list' : `${count.lists} lists`;
    return `${items(count.own)} · ${count.total} in total · ${lists} included`;
  }

  protected initial(title: string): string {
    return [...title.trim()][0]?.toLocaleUpperCase() ?? '';
  }

  private async askTitle(data: TitleDialogData): Promise<string | undefined> {
    const ref = this.dialog.open<TitleDialog, TitleDialogData, string>(
      TitleDialog,
      {
        data,
        autoFocus: 'first-tabbable',
      },
    );
    return firstValueFrom(ref.afterClosed());
  }
}

const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' });

/**
 * "Copy of <title>", shortened to the title limit if needed (counted in code points, like the
 * schema), without cutting an emoji or a letter with its accents in half.
 */
export function copyTitle(title: string): string {
  let out = '';
  let length = 0;
  for (const { segment } of graphemes.segment(`Copy of ${title}`)) {
    const size = [...segment].length;
    if (length + size > LIMITS.title) break;
    out += segment;
    length += size;
  }
  return out.trimEnd();
}
