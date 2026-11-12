import { Component, computed, inject } from '@angular/core';
import { MatFabButton, MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { type List, newId } from '@lister/shared/domain';
import {
  CurrentSpace,
  Repositories,
  valueOf,
} from '@lister/web/data-access-local-db';
import { type MutationRequest, SyncEngine } from '@lister/web/data-access-sync';
import { TitleDialog, type TitleDialogData } from '@lister/web/ui';
import { NOTICE_DURATION_MS, Notifier } from '@lister/web/util-notify';
import { firstValueFrom } from 'rxjs';

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
  ],
  templateUrl: './lists-page.html',
  styleUrl: './lists-page.scss',
})
export class ListsPage {
  private readonly space = inject(CurrentSpace);
  private readonly repositories = inject(Repositories);
  private readonly sync = inject(SyncEngine);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(Notifier);

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
    const counts = valueOf(this.counts());
    return {
      kind: 'lists' as const,
      lists: lists.value.map((list) => ({
        list,
        count: counts?.get(list.id) ?? 0,
      })),
    };
  });

  protected async create(): Promise<void> {
    const title = await this.askTitle({
      heading: 'New list',
      confirm: 'Create',
    });
    if (title)
      await this.change({ name: 'list.create', args: { id: newId(), title } });
  }

  protected async rename(list: List): Promise<void> {
    const title = await this.askTitle({
      heading: 'Rename list',
      confirm: 'Rename',
      title: list.title,
    });
    if (title && title !== list.title) {
      await this.change({
        name: 'list.update',
        args: { id: list.id, patch: { title } },
      });
    }
  }

  protected async remove(list: List): Promise<void> {
    if (!(await this.change({ name: 'list.delete', args: { id: list.id } })))
      return;
    const outcome = await this.notifier.notify({
      message: `Deleted “${list.title}”`,
      action: 'Undo',
      duration: NOTICE_DURATION_MS,
    });
    if (outcome === 'action') {
      await this.change({ name: 'list.restore', args: { id: list.id } });
    }
  }

  protected itemCount(count: number): string {
    return count === 1 ? '1 item' : `${count} items`;
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

  /** Sends a change through the sync engine; a refusal is shown to the user. */
  private async change(
    request: Pick<MutationRequest, 'name' | 'args'>,
  ): Promise<boolean> {
    const spaceId = this.space.id();
    if (!spaceId) return false;
    const result = await this.sync.mutate({
      ...request,
      spaceId,
    } as MutationRequest);
    if (!result.ok) {
      void this.notifier.notify({
        message: result.reason,
        duration: NOTICE_DURATION_MS,
      });
    }
    return result.ok;
  }
}
