import { Component, computed, inject } from '@angular/core';
import { MatFabButton, MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import { type List, flattenEntries, newId } from '@lister/shared/domain';
import { CurrentSpace, Repositories } from '@lister/web/data-access-local-db';
import { TitleDialog, type TitleDialogData } from '@lister/web/ui';
import { SpaceChanges } from '@lister/web/data-access-sync';
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
