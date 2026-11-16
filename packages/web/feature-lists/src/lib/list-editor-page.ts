import {
  Component,
  ElementRef,
  type Signal,
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
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import {
  type FlatEntry,
  type Include,
  type Item,
  type List,
  type Positioned,
  type Titled,
  flattenEntries,
  moveTo,
  newId,
  positionAtEnd,
  positionBetween,
  positionForSortedInsert,
  sortByTitle,
  wouldCreateCycle,
} from '@lister/shared/domain';
import { titleSchema } from '@lister/shared/sync-protocol';
import {
  CurrentSpace,
  Repositories,
  type SpaceComposition,
} from '@lister/web/data-access-local-db';
import {
  AddOrderToggle,
  ItemDialog,
  attribution,
  type ItemDialogData,
  type ItemFields,
  ListPickerDialog,
  type ListPickerData,
  LoadingHint,
} from '@lister/web/ui';
import { SpaceChanges } from '@lister/web/data-access-sync';
import { AddItemOrderPreference, RunStarter } from '@lister/web/feature-runs';
import { firstValueFrom } from 'rxjs';

/** A row of the list itself: one of its own items, or an included list (a section). */
export type EditorRow =
  | { kind: 'item'; id: string; position: string; item: Item }
  | {
      kind: 'section';
      id: string;
      position: string;
      include: Include;
      list: List | undefined;
      state: 'live' | 'deleted' | 'repeated';
      /** How many lists other than this one use the included list. */
      otherUsers: number;
      /** The included list's entries, nested includes among them. */
      entries: FlatEntry[];
    };

/**
 * How many lists use `listId` other than `root` and the lists that only reach it through
 * `root` (those change along with `root` anyway).
 */
function otherUsers(space: SpaceComposition, listId: string, root: string) {
  const throughRoot = space.usersOf(root);
  return [...space.usersOf(listId)].filter(
    (user) => user !== root && !throughRoot.has(user),
  ).length;
}

/** Every list `root` contains through live includes, at any depth. */
function reachableFrom(space: SpaceComposition, root: string): Set<string> {
  const reached = new Set<string>();
  const stack = [root];
  while (stack.length > 0) {
    for (const row of space.includesOf(stack.pop() as string)) {
      if (row.deletedAt !== null || reached.has(row.childListId)) continue;
      reached.add(row.childListId);
      stack.push(row.childListId);
    }
  }
  return reached;
}

/**
 * One list: its own items and its included lists as sections, in one order (design §2.2). Add
 * items (also several pasted lines) and lists, edit, delete or remove with Undo, reorder. Items
 * inside a section belong to the included list: editing one edits that list.
 */
@Component({
  selector: 'lister-list-editor-page',
  imports: [
    AddOrderToggle,
    LoadingHint,
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    FormField,
    MatButton,
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
  private readonly currentSpace = inject(CurrentSpace);
  private readonly starter = inject(RunStarter);
  protected readonly addOrder = inject(AddItemOrderPreference);

  private readonly list = this.repositories.list(this.listId);
  /** The signed-in user, so a delete made on another device of theirs says "you". */
  private readonly me = this.repositories.currentUserId();
  private readonly spaceId = computed(() => {
    const list = this.list();
    return list.status === 'ready' ? list.value?.spaceId : undefined;
  });
  private readonly space = this.repositories.compositionOfSpace(this.spaceId);
  /** The space's lists by title, for the picker. */
  private readonly spaceLists = this.repositories.listsOfSpace(this.spaceId);
  /** Sections the user folded (by include id); they start open. */
  protected readonly collapsed = signal<ReadonlySet<string>>(new Set());

  /**
   * The order a move (drag or Move up / down) asked for, shown until the local data has it.
   * Without it, the dragged row would jump back to its old place for a moment: the drop list
   * restores the DOM order, and the new positions arrive a little later from the local
   * database (in several steps when ties are re-keyed).
   */
  private readonly heldOrder = signal<readonly string[] | null>(null);

  protected readonly view = computed(() => {
    const view = this.dataView();
    const order = this.heldOrder();
    if (view.kind !== 'ready' || !order) return view;
    const byId = new Map(view.rows.map((row) => [row.id, row]));
    const rows = [
      ...order.flatMap((id) => byId.get(id) ?? []),
      ...view.rows.filter((row) => !order.includes(row.id)), // added meanwhile
    ];
    return { ...view, rows };
  });

  private readonly dataView = computed(() => {
    const list = this.list();
    if (list.status === 'error') return { kind: 'error' as const };
    if (list.status === 'loading') return { kind: 'loading' as const };
    if (!list.value) return { kind: 'missing' as const };
    if (list.value.deletedAt !== null) {
      return { kind: 'deleted' as const, list: list.value };
    }
    const space = this.space();
    if (space.status === 'error') return { kind: 'error' as const };
    if (space.status === 'loading') return { kind: 'loading' as const };
    const root = list.value.id;
    const rows: EditorRow[] = [];
    for (const entry of flattenEntries(root, space.value)) {
      if (entry.depth > 0) {
        const section = rows.at(-1);
        if (section?.kind === 'section') section.entries.push(entry);
      } else if (entry.kind === 'item') {
        const { item } = entry;
        rows.push({ kind: 'item', id: item.id, position: item.position, item });
      } else {
        const { include, list: child, state } = entry;
        rows.push({
          kind: 'section',
          id: include.id,
          position: include.position,
          include,
          list: child,
          state,
          otherUsers: otherUsers(space.value, include.childListId, root),
          entries: [],
        });
      }
    }
    return {
      kind: 'ready' as const,
      list: list.value,
      rows,
      space: space.value,
    };
  });

  private readonly draft = signal({ title: '' });
  protected readonly addForm = form(this.draft);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly announcer = inject(LiveAnnouncer);
  /** Adds run one at a time, each after the last key handed out, so they never interleave. */
  private adding: Promise<unknown> = Promise.resolve();
  private lastAdded: string | null = null;
  /**
   * After a keyboard move, the row whose menu button gets the focus back, with its position
   * before and after the move.
   */
  private readonly refocus = signal<{
    id: string;
    from: string;
    to: string;
  } | null>(null);

  constructor() {
    const title = inject(Title);
    effect(() => {
      const view = this.view();
      if (view.kind === 'ready' || view.kind === 'deleted') {
        title.setTitle(`${view.list.title} · Lister`);
      }
    });
    // Drop the held order once the data has caught up (or after a while, e.g. when another
    // device moved something at the same time).
    effect((onCleanup) => {
      const order = this.heldOrder();
      if (!order) return;
      const view = this.dataView();
      const ids = view.kind === 'ready' ? view.rows.map((row) => row.id) : [];
      if (
        ids.length === order.length &&
        ids.every((id, i) => id === order[i])
      ) {
        this.heldOrder.set(null);
        return;
      }
      const timer = setTimeout(() => this.heldOrder.set(null), 3000);
      onCleanup(() => clearTimeout(timer));
    });
    // The moved row is re-rendered, which drops the focus: put it back on its menu button.
    afterRenderEffect(() => {
      const target = this.refocus();
      const view = this.view();
      if (!target || view.kind !== 'ready') return;
      const row = view.rows.find((r) => r.id === target.id);
      // Not moved yet: wait for the render that moves it (moving its node drops the focus).
      if (row?.position === target.from) return;
      // Once only, whatever happened: later renders must not steal the focus.
      this.refocus.set(null);
      // Gone, or moved again by someone else meanwhile: leave the focus alone.
      if (row?.position !== target.to) return;
      const trigger = this.host.nativeElement.querySelector<HTMLElement>(
        `[data-item-id="${CSS.escape(target.id)}"]`,
      );
      if (trigger && trigger.ownerDocument.activeElement !== trigger)
        trigger.focus();
    });
  }

  /** "Start run": a run with a copy of this list's items, included lists' too (D2), opened. */
  protected startRun(): Promise<void> {
    const view = this.view();
    if (view.kind !== 'ready') return Promise.resolve();
    return this.starter.fromList(view.list, view.space);
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

  /**
   * "Sort A–Z" (D17) for `listId`: this list, or an included list's section (which sorts that
   * list itself, so the new order shows wherever it is included). The includes among the items
   * keep their slots; Undo sends the old positions back.
   */
  protected async sort(listId: string): Promise<void> {
    const view = this.view();
    if (view.kind !== 'ready') return;
    const items = view.space
      .itemsOf(listId)
      .filter((i) => i.deletedAt === null);
    const includes = view.space
      .includesOf(listId)
      .filter((row) => row.deletedAt === null);
    const changes = sortByTitle(items, includes);
    if (changes.length === 0) {
      this.changes.tell('Already in A–Z order');
      return;
    }
    const before = new Map(items.map((item) => [item.id, item.position]));
    const title = view.space.list(listId)?.title ?? 'List';
    await this.changes.withUndo(
      { name: 'list.sortItems', args: { listId, items: changes } },
      `Sorted “${title}” A–Z`,
      {
        name: 'list.sortItems',
        args: {
          listId,
          items: changes.map(({ id }) => ({
            id,
            position: before.get(id) as string,
          })),
        },
      },
    );
  }

  /** Edits an item; one inside a section belongs to (and changes) the included list. */
  protected async edit(item: Item): Promise<void> {
    const ref = this.dialog.open<
      ItemDialog,
      ItemDialogData,
      Partial<ItemFields>
    >(ItemDialog, {
      data: {
        title: item.title,
        quantity: item.quantity,
        note: item.note,
        notice: this.sourceNotice(item.listId),
        editedBy: attribution(
          this.currentSpace.memberName(item.spaceId, item.updatedBy),
          item.updatedAt,
        ),
        deleted: this.deletedNotice(item),
        restore: () => this.restoreFor(item),
      },
      autoFocus: 'first-tabbable',
    });
    const patch = await firstValueFrom(ref.afterClosed());
    if (patch)
      await this.changes.apply({
        name: 'item.update',
        args: { id: item.id, patch },
      });
  }

  /**
   * What someone deleted while `item`'s dialog is open (live): the item ("Deleted by Ben") or
   * the list it belongs to, this one or an included one ("“Camping” was deleted by Ben").
   * `undefined` while the item can be changed. The deleting change is the last one on the row,
   * so `updatedBy` is theirs.
   */
  private deletedNotice(item: Item): Signal<string | undefined> {
    return computed(() => {
      const deleted = this.deletedFor(item);
      if (!deleted) return undefined;
      const by = this.byWhom(deleted.row);
      return deleted.kind === 'item'
        ? `Deleted by ${by}`
        : `“${deleted.row.title}” was deleted by ${by}`;
    });
  }

  /** The deleted row that keeps `item` from being changed: the item itself, or its list. */
  private deletedFor(
    item: Item,
  ): { kind: 'item'; row: Item } | { kind: 'list'; row: List } | undefined {
    const view = this.dataView();
    if (view.kind === 'deleted') {
      // Items of included lists can still be changed; this list's own can't.
      return view.list.id === item.listId
        ? { kind: 'list', row: view.list }
        : undefined;
    }
    if (view.kind !== 'ready') return undefined;
    const now = view.space
      .itemsOf(item.listId)
      .find((row) => row.id === item.id);
    if (now && now.deletedAt !== null) return { kind: 'item', row: now };
    const list = view.space.list(item.listId);
    if (list && list.deletedAt !== null) return { kind: 'list', row: list };
    return undefined;
  }

  /** Restores what keeps `item` from being changed (one step at a time). */
  private restoreFor(item: Item): Promise<boolean> {
    const deleted = this.deletedFor(item);
    if (!deleted) return Promise.resolve(true);
    return this.changes.apply(
      deleted.kind === 'item'
        ? { name: 'item.restore', args: { id: deleted.row.id } }
        : { name: 'list.restore', args: { id: deleted.row.id } },
    );
  }

  private byWhom(row: Item | List): string {
    const me = this.me();
    if (me.status === 'ready' && me.value === row.updatedBy) return 'you';
    return (
      this.currentSpace.memberName(row.spaceId, row.updatedBy) ?? 'someone'
    );
  }

  protected remove(item: Item): Promise<boolean> {
    return this.changes.withUndo(
      { name: 'item.delete', args: { id: item.id } },
      `Deleted “${item.title}”`,
      { name: 'item.restore', args: { id: item.id } },
    );
  }

  /**
   * "Add list": a picker without this list, lists it already contains (directly or through
   * another list: adding those would show nothing new) and lists that would make a loop.
   */
  protected async addList(): Promise<void> {
    const view = this.view();
    const lists = this.spaceLists();
    if (view.kind !== 'ready' || lists.status !== 'ready') return;
    const root = view.list.id;
    const included = reachableFrom(view.space, root);
    const choices = lists.value
      .filter(
        (list) =>
          list.id !== root &&
          !included.has(list.id) &&
          !wouldCreateCycle(root, list.id, view.space.includesOf),
      )
      .map(({ id, title }) => ({ id, title }));
    const ref = this.dialog.open<ListPickerDialog, ListPickerData, string>(
      ListPickerDialog,
      { data: { lists: choices }, autoFocus: 'first-tabbable' },
    );
    const childListId = await firstValueFrom(ref.afterClosed());
    if (!childListId) return;
    await this.changes.apply({
      name: 'include.create',
      args: {
        id: newId(),
        parentListId: root,
        childListId,
        position: positionAtEnd(this.currentRows()),
      },
    });
  }

  /** Removes an included list from this list (the list itself stays), with Undo. */
  protected removeSection(row: Extract<EditorRow, { kind: 'section' }>) {
    return this.changes.withUndo(
      { name: 'include.delete', args: { id: row.include.id } },
      `Removed “${this.sectionTitle(row)}” from this list`,
      { name: 'include.restore', args: { id: row.include.id } },
    );
  }

  protected toggle(includeId: string): void {
    this.collapsed.update((set) => {
      const next = new Set(set);
      if (!next.delete(includeId)) next.add(includeId);
      return next;
    });
  }

  /** What a section shows under its title, if anything. */
  protected sectionNote(row: Extract<EditorRow, { kind: 'section' }>) {
    if (row.state === 'deleted') return 'This list is in the trash.';
    if (row.state === 'repeated')
      return 'Already shown above, inside another list.';
    return undefined;
  }

  protected sectionTitle(row: Extract<EditorRow, { kind: 'section' }>) {
    return row.state === 'deleted' || !row.list
      ? 'Deleted list'
      : row.list.title;
  }

  /** The title of a nested section header. */
  protected nestedTitle(entry: Extract<FlatEntry, { kind: 'section' }>) {
    if (entry.state === 'deleted' || !entry.list) return 'Deleted list';
    return entry.state === 'repeated'
      ? `${entry.list.title} (shown above)`
      : entry.list.title;
  }

  /** Move up / Move down from a row's menu: keeps the keyboard focus on the row. */
  protected async step(row: EditorRow, toIndex: number): Promise<void> {
    const to = await this.move(row, toIndex);
    if (to !== undefined) {
      this.refocus.set({ id: row.id, from: row.position, to });
      const count = this.currentRows().length;
      const title =
        row.kind === 'item' ? row.item.title : this.sectionTitle(row);
      void this.announcer.announce(
        `${title} moved to position ${toIndex + 1} of ${count}`,
      );
    }
  }

  protected drop(event: CdkDragDrop<unknown, unknown, EditorRow>): void {
    if (event.previousIndex === event.currentIndex) return;
    // The dragged row itself, not "whatever is at previousIndex now": rows may have changed
    // during the drag (another device, a rollback).
    void this.move(event.item.data, event.currentIndex);
  }

  /**
   * Puts the row at `toIndex` among the list's own rows (items and sections share one key
   * space); ties are re-keyed so the move always takes effect. Returns the row's new position,
   * or `undefined` if it didn't move.
   */
  private async move(
    row: EditorRow,
    toIndex: number,
  ): Promise<string | undefined> {
    const rows = this.currentRows();
    // Show the new order at once; the positions follow (possibly in several steps).
    const order = rows.map((r) => r.id).filter((id) => id !== row.id);
    order.splice(toIndex, 0, row.id);
    this.heldOrder.set(order);
    const kinds = new Map(rows.map((r) => [r.id, r.kind]));
    const changes = moveTo(rows, row.id, toIndex);
    for (const change of changes) {
      const moved = await this.changes.apply(
        kinds.get(change.id) === 'section'
          ? { name: 'include.move', args: change }
          : { name: 'item.move', args: change },
      );
      if (!moved) {
        this.heldOrder.set(null); // refused (the refusal is shown): back to the data
        return undefined;
      }
    }
    if (changes.length === 0) this.heldOrder.set(null);
    return changes.find((change) => change.id === row.id)?.position;
  }

  /** For editing an item of an included list: which list it changes, and who else uses it. */
  private sourceNotice(listId: string): string | undefined {
    const view = this.view();
    if (view.kind !== 'ready' || listId === view.list.id) return undefined;
    const source = view.space.list(listId);
    const others = otherUsers(view.space, listId, view.list.id);
    const title = `Changes “${source?.title ?? 'another list'}”`;
    if (others === 0) return title;
    return `${title}, also used in ${others} other ${others === 1 ? 'list' : 'lists'}`;
  }

  /** Appends items in order; stops at the first refusal (which is shown). */
  private addItems(titles: string[]): Promise<boolean> {
    const run = this.adding.then(async () => {
      // "Sort in" (D17): before the first item of this list that sorts after the new one. Each
      // title counts the ones added before it, which the rows may not show yet.
      const sortIn = this.addOrder.order() === 'sorted';
      const current = this.currentRows();
      const rows: Titled[] = current.map(({ id, position, ...row }) => ({
        id,
        position,
        title: row.kind === 'item' ? row.item.title : '',
      }));
      const own = new Set(
        current.flatMap((row) => (row.kind === 'item' ? [row.id] : [])),
      );
      for (const title of titles) {
        const end = positionAtEnd(rows);
        const position = sortIn
          ? positionForSortedInsert(
              title,
              rows.filter((row) => own.has(row.id)),
              rows,
            )
          : this.lastAdded && this.lastAdded >= end
            ? positionBetween(this.lastAdded, null)
            : end;
        const id = newId();
        const added = await this.changes.apply({
          name: 'item.create',
          args: { id, listId: this.listId(), title, position },
        });
        if (!added) return false;
        this.lastAdded = position;
        rows.push({ id, position, title });
        own.add(id);
      }
      return true;
    });
    this.adding = run;
    return run;
  }

  private currentRows(): (EditorRow & Positioned)[] {
    const view = this.view();
    return view.kind === 'ready' ? view.rows : [];
  }
}
