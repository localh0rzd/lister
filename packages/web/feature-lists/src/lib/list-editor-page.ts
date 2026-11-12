import {
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Title } from '@angular/platform-browser';
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
  moveTo,
  newId,
  positionAtEnd,
  positionBetween,
} from '@lister/shared/domain';
import { titleSchema } from '@lister/shared/sync-protocol';
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

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly announcer = inject(LiveAnnouncer);
  /** Adds run one at a time, each after the last key handed out, so they never interleave. */
  private adding: Promise<unknown> = Promise.resolve();
  private lastAdded: string | null = null;
  /** After a keyboard move, the item whose menu button gets the focus back. */
  private readonly refocus = signal<string | null>(null);

  constructor() {
    const title = inject(Title);
    effect(() => {
      const view = this.view();
      if (view.kind === 'ready' || view.kind === 'deleted') {
        title.setTitle(`${view.list.title} · Lister`);
      }
    });
    // The moved row is re-rendered, which drops the focus: put it back on its menu button.
    afterRenderEffect(() => {
      const id = this.refocus();
      this.view();
      if (!id) return;
      const trigger = this.host.nativeElement.querySelector<HTMLElement>(
        `[data-item-id="${CSS.escape(id)}"]`,
      );
      if (trigger && trigger.ownerDocument.activeElement !== trigger)
        trigger.focus();
    });
  }

  /** Adds the typed item (Enter or the + button). */
  protected add(event: Event): void {
    event.preventDefault();
    void submit(this.addForm, async () => {
      const title = this.draft().title.trim();
      if (!title) return;
      if (await this.addItems([title])) this.draft.set({ title: '' });
    });
  }

  /** Pasting several lines adds one item per line, all or none. */
  protected paste(event: ClipboardEvent): void {
    const lines = (event.clipboardData?.getData('text') ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length < 2) return; // one line: an ordinary paste into the field
    event.preventDefault();
    const invalid = lines.findIndex(
      (line) => !titleSchema.safeParse(line).success,
    );
    if (invalid >= 0) {
      const reason = titleSchema.safeParse(lines[invalid]).error?.issues[0]
        ?.message;
      this.changes.tell(
        `Nothing added: line ${invalid + 1} — ${reason ?? 'invalid'}`,
      );
      return;
    }
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

  /** Move up / Move down from the item menu: keeps the keyboard focus on the item. */
  protected async step(item: Item, toIndex: number): Promise<void> {
    if (await this.move(item, toIndex)) {
      this.refocus.set(item.id);
      const count = this.currentItems().length;
      void this.announcer.announce(
        `${item.title} moved to position ${toIndex + 1} of ${count}`,
      );
    }
  }

  protected drop(event: CdkDragDrop<unknown, unknown, Item>): void {
    if (event.previousIndex === event.currentIndex) return;
    // The dragged item itself, not "whatever is at previousIndex now": rows may have changed
    // during the drag (another device, a rollback).
    void this.move(event.item.data, event.currentIndex);
  }

  /** Puts the item at `toIndex`; ties are re-keyed so the move always takes effect. */
  private async move(item: Item, toIndex: number): Promise<boolean> {
    const changes = moveTo(this.currentItems(), item.id, toIndex);
    for (const change of changes) {
      const moved = await this.changes.apply({
        name: 'item.move',
        args: change,
      });
      if (!moved) return false;
    }
    return changes.length > 0;
  }

  /** Appends items in order; stops at the first refusal (which is shown). */
  private addItems(titles: string[]): Promise<boolean> {
    const run = this.adding.then(async () => {
      for (const title of titles) {
        const end = positionAtEnd(this.currentItems());
        const position =
          this.lastAdded && this.lastAdded >= end
            ? positionBetween(this.lastAdded, null)
            : end;
        const added = await this.changes.apply({
          name: 'item.create',
          args: { id: newId(), listId: this.listId(), title, position },
        });
        if (!added) return false;
        this.lastAdded = position;
      }
      return true;
    });
    this.adding = run;
    return run;
  }

  private currentItems(): Item[] {
    const view = this.view();
    return view.kind === 'ready' ? view.items : [];
  }
}
