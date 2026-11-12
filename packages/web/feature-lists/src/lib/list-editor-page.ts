import { Component, computed, inject, input, signal } from '@angular/core';
import {
  CdkDrag,
  type CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import { FormField, form, submit } from '@angular/forms/signals';
import { MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import {
  type Item,
  newId,
  positionAt,
  positionAtEnd,
  positionBetween,
} from '@lister/shared/domain';
import { Repositories } from '@lister/web/data-access-local-db';
import { ItemDialog, type ItemFields } from '@lister/web/ui';
import { firstValueFrom } from 'rxjs';
import { SpaceChanges } from './space-changes';

/** One list's items: add (also several pasted lines), edit, delete with Undo, reorder. */
@Component({
  selector: 'lister-list-editor-page',
  imports: [
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    FormField,
    MatFormField,
    MatIcon,
    MatIconButton,
    MatInput,
    MatLabel,
    MatMenu,
    MatMenuItem,
    MatMenuTrigger,
    RouterLink,
  ],
  templateUrl: './list-editor-page.html',
  styleUrl: './list-editor-page.scss',
})
export class ListEditorPage {
  /** From the route (`lists/:listId`). */
  readonly listId = input.required<string>();

  private readonly repositories = inject(Repositories);
  private readonly changes = inject(SpaceChanges);
  private readonly dialog = inject(MatDialog);

  private readonly list = this.repositories.list(this.listId);
  private readonly items = this.repositories.itemsOfList(this.listId);

  protected readonly view = computed(() => {
    const list = this.list();
    const items = this.items();
    if (list.status === 'error' || items.status === 'error')
      return { kind: 'error' as const };
    if (list.status === 'loading' || items.status === 'loading') {
      return { kind: 'loading' as const };
    }
    if (!list.value) return { kind: 'missing' as const };
    if (list.value.deletedAt !== null) {
      return { kind: 'deleted' as const, list: list.value };
    }
    return { kind: 'ready' as const, list: list.value, items: items.value };
  });

  private readonly draft = signal({ title: '' });
  protected readonly addForm = form(this.draft);

  /** Adds the typed item (Enter or the + button). */
  protected add(event: Event): void {
    event.preventDefault();
    void submit(this.addForm, async () => {
      const title = this.draft().title.trim();
      if (!title) return;
      if (await this.addItems([title])) this.draft.set({ title: '' });
    });
  }

  /** Pasting several lines adds one item per line. */
  protected paste(event: ClipboardEvent): void {
    const lines = (event.clipboardData?.getData('text') ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length < 2) return; // one line: an ordinary paste into the field
    event.preventDefault();
    void this.addItems(lines);
  }

  protected async edit(item: Item): Promise<void> {
    const ref = this.dialog.open<ItemDialog, ItemFields, Partial<ItemFields>>(
      ItemDialog,
      {
        data: { title: item.title, quantity: item.quantity, note: item.note },
        autoFocus: 'first-tabbable',
      },
    );
    const patch = await firstValueFrom(ref.afterClosed());
    if (patch)
      await this.changes.apply({
        name: 'item.update',
        args: { id: item.id, patch },
      });
  }

  protected remove(item: Item): Promise<void> {
    return this.changes.withUndo(
      { name: 'item.delete', args: { id: item.id } },
      `Deleted “${item.title}”`,
      { name: 'item.restore', args: { id: item.id } },
    );
  }

  protected move(item: Item, toIndex: number): Promise<boolean> {
    const others = this.currentItems().filter((other) => other.id !== item.id);
    return this.changes.apply({
      name: 'item.move',
      args: { id: item.id, position: positionAt(others, toIndex) },
    });
  }

  protected drop(event: CdkDragDrop<unknown>): void {
    if (event.previousIndex === event.currentIndex) return;
    const item = this.currentItems()[event.previousIndex];
    if (item) void this.move(item, event.currentIndex);
  }

  /** Appends items in order; stops at the first refusal (which is shown). */
  private async addItems(titles: string[]): Promise<boolean> {
    let position = positionAtEnd(this.currentItems());
    for (const title of titles) {
      const added = await this.changes.apply({
        name: 'item.create',
        args: { id: newId(), listId: this.listId(), title, position },
      });
      if (!added) return false;
      position = positionBetween(position, null);
    }
    return true;
  }

  private currentItems(): Item[] {
    const view = this.view();
    return view.kind === 'ready' ? view.items : [];
  }
}
