import { Component, computed, inject } from '@angular/core';
import { MatFabButton, MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import { type List, newId } from '@lister/shared/domain';
import { CurrentSpace, Repositories } from '@lister/web/data-access-local-db';
import { TitleDialog, type TitleDialogData } from '@lister/web/ui';
import { firstValueFrom } from 'rxjs';
import { SpaceChanges } from './space-changes';

/** The Lists destination: every list of the space with its item count (design §2.7). */
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
  private readonly counts = this.repositories.itemCountsOfSpace(this.space.id);

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
    const counts = this.counts();
    return {
      kind: 'lists' as const,
      lists: lists.value.map((list) => ({
        list,
        count:
          counts.status === 'ready' ? (counts.value.get(list.id) ?? 0) : null,
      })),
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

  protected itemCount(count: number | null): string {
    if (count === null) return '–';
    return count === 1 ? '1 item' : `${count} items`;
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
