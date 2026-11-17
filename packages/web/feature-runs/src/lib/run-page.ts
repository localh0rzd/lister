import {
  Component,
  EnvironmentInjector,
  type Signal,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { FormField, form, submit } from '@angular/forms/signals';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { Router, RouterLink } from '@angular/router';
import {
  type RunItem,
  type RunItemState,
  isRunFinished,
  newId,
  positionForSortedInsert,
  runItemsFromList,
  sortByTitle,
} from '@lister/shared/domain';
import { titleSchema } from '@lister/shared/sync-protocol';
import { CurrentSpace, Repositories } from '@lister/web/data-access-local-db';
import { type SpaceChange, SpaceChanges } from '@lister/web/data-access-sync';
import {
  type PrintGroup,
  PrintSheet,
  Transfers,
} from '@lister/web/feature-transfer';
import {
  AddItemField,
  AddOrderToggle,
  ItemDialog,
  attribution,
  type ItemDialogData,
  type ItemFields,
  ListPickerDialog,
  type ListPickerData,
  LoadingHint,
  TitleDialog,
  type TitleDialogData,
} from '@lister/web/ui';
import { NOTICE_DURATION_MS, Notifier } from '@lister/web/util-notify';
import { firstValueFrom } from 'rxjs';
import { AddItemOrderPreference } from './add-item-order-preference';
import { DoneSectionPreference } from './done-section-preference';
import { layoutRun, progressText } from './run-sections';

/** A state set here: what the item had (`from`, `stateAt`), what was sent, and the box clicked. */
interface SentState {
  from: RunItemState;
  to: RunItemState;
  stateAt: number | null;
  box?: MatCheckbox;
  /** Written locally: from now on the data shows it, or a change made after it. */
  written?: boolean;
}

/**
 * One run (design §2.1): its items grouped by the list they came from, with check, uncheck and
 * skip, and a progress bar. Items and whole lists can be added, items edited and removed — all
 * only in this run. Once everything is checked or skipped the run finishes and this page goes
 * back to the Runs page; the snackbar offers Undo, which reverts the change that finished it.
 */
@Component({
  selector: 'lister-run-page',
  imports: [
    AddItemField,
    AddOrderToggle,
    FormField,
    LoadingHint,
    PrintSheet,
    MatButton,
    MatCheckbox,
    MatIcon,
    MatIconButton,
    MatMenu,
    MatMenuItem,
    MatMenuTrigger,
    MatProgressBar,
    MatSlideToggle,
    NgTemplateOutlet,
    RouterLink,
  ],
  host: { 'data-printable': '' },
  templateUrl: './run-page.html',
  styleUrl: './run-page.scss',
})
export class RunPage {
  /** From the route (`runs/:runId`). */
  readonly runId = input.required<string>();

  private readonly repositories = inject(Repositories);
  private readonly changes = inject(SpaceChanges);
  private readonly transfers = inject(Transfers);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly space = inject(CurrentSpace);
  private readonly environment = inject(EnvironmentInjector);
  protected readonly doneSection = inject(DoneSectionPreference);
  protected readonly addOrder = inject(AddItemOrderPreference);

  private readonly run = this.repositories.run(this.runId);
  private readonly items = this.repositories.itemsOfRun(this.runId);
  /** The item whose edit dialog is open, removed or not: someone may remove it meanwhile. */
  private readonly editingId = signal<string | undefined>(undefined);
  private readonly editing = this.repositories.runItem(this.editingId);
  /** The signed-in user, so a removal made on another device of theirs says "you". */
  private readonly me = this.repositories.currentUserId();
  private readonly spaceId = computed(() => {
    const run = this.run();
    return run.status === 'ready' ? run.value?.spaceId : undefined;
  });
  private readonly composition = this.repositories.compositionOfSpace(
    this.spaceId,
  );
  private readonly spaceLists = this.repositories.listsOfSpace(this.spaceId);

  /** Set when a change made here finishes the run: its own notice (with Undo) says so. */
  private finishedHere = false;

  /**
   * States set here that the local data may not show yet (item id → from, to, the item's
   * `stateAt` when sent, and the checkbox clicked). Two quick checks would otherwise each see the
   * other item unchecked, and the one that finishes the run would not know it.
   */
  private readonly sentStates = new Map<string, SentState>();

  /** What "Print" prints: every item with its check state, in the sections of the page. */
  protected readonly printGroups = computed<PrintGroup[]>(() => {
    const view = this.view();
    if (view.kind !== 'ready') return [];
    const composition = this.composition();
    const { sections } = layoutRun(
      view.items,
      (id) =>
        composition.status === 'ready'
          ? composition.value.list(id)?.title
          : undefined,
      false,
    );
    return sections.map((section) => ({
      key: section.key,
      title: section.title,
      items: section.rows.map((row) => row.item),
    }));
  });

  protected readonly view = computed(() => {
    const run = this.run();
    const items = this.items();
    if (run.status === 'error' || items.status === 'error')
      return { kind: 'error' as const };
    if (run.status === 'loading' || items.status === 'loading')
      return { kind: 'loading' as const };
    if (!run.value || run.value.deletedAt !== null)
      return { kind: 'missing' as const };
    if (run.value.finishedAt !== null)
      return { kind: 'finished' as const, run: run.value };
    const composition = this.composition();
    const listTitle = (id: string) =>
      composition.status === 'ready'
        ? composition.value.list(id)?.title
        : undefined;
    const layout = layoutRun(items.value, listTitle, this.doneSection.on());
    const { done, total } = layout.progress;
    return {
      kind: 'ready' as const,
      run: run.value,
      items: items.value,
      layout,
      progress: progressText(layout.progress),
      percent: total === 0 ? 0 : Math.round((done / total) * 100),
      /** "Add list" needs the space's lists and their items. */
      listsReady:
        composition.status === 'ready' && this.spaceLists().status === 'ready',
    };
  });

  private readonly draft = signal({ title: '' });
  protected readonly addForm = form(this.draft);
  private readonly knownTitleState = this.repositories.itemTitles();
  /** Titles to suggest while typing (D22): the items of every list on this device. */
  protected readonly knownTitles = computed(() => {
    const state = this.knownTitleState();
    return state.status === 'ready' ? state.value : [];
  });
  /** This run's items: not suggested again. */
  protected readonly heldTitles = computed(() => {
    const items = this.items();
    return items.status === 'ready' ? items.value.map((i) => i.title) : [];
  });

  constructor() {
    const title = inject(Title);
    // A sent state is done with once the local data shows any later state change: kept longer,
    // a change by someone else back to the state before it would count as sent.
    effect(() => {
      const items = this.items();
      if (items.status !== 'ready') return;
      const rows = new Map(items.value.map((item) => [item.id, item]));
      for (const [id, sent] of this.sentStates) {
        // Before it's written, a change of the row (e.g. the server's copy of an earlier check)
        // isn't one made after it.
        if (!sent.written || this.stillShows(rows.get(id), sent)) continue;
        this.sentStates.delete(id);
        // The data has caught up: usually it shows the click, but a change merged with someone
        // else's (so the row's state never changed) must not leave the box as clicked.
        this.resetBox(id, sent);
      }
    });
    effect(() => {
      const view = this.view();
      if (view.kind === 'ready') title.setTitle(`${view.run.title} · Lister`);
      // Finished, here or by someone else: it leaves the active runs and is in the trash (D10).
      if (view.kind === 'finished') {
        if (!this.finishedHere)
          this.changes.tell(`“${view.run.title}” is finished`);
        void this.router.navigate(['/runs']);
      }
    });
  }

  /** Check or uncheck (the checkbox): always sets the state, never toggles. */
  protected check(
    item: RunItem,
    checked: boolean,
    box: MatCheckbox,
  ): Promise<void> {
    return this.setState(item, checked ? 'checked' : 'unchecked', box);
  }

  /** `box`: the checkbox clicked, if any, to put back to the data when the change doesn't show. */
  protected async setState(
    item: RunItem,
    state: RunItemState,
    box?: MatCheckbox,
  ): Promise<void> {
    const change: SpaceChange = {
      name: 'runItem.setState',
      args: { id: item.id, state },
    };
    const undo: SpaceChange = {
      name: 'runItem.setState',
      args: { id: item.id, state: item.state },
    };
    const finishes = this.finishes((items) =>
      items.map((i) => (i.id === item.id ? { ...i, state } : i)),
    );
    const sent: SentState = {
      from: item.state,
      to: state,
      stateAt: item.stateAt,
      box,
    };
    this.sentStates.set(item.id, sent);
    const applied = finishes
      ? await this.finish(change, undo)
      : await this.changes.apply(change);
    if (applied) sent.written = true;
    if (applied || this.sentStates.get(item.id) !== sent) return;
    // Refused: nothing was written, so the data is what the box should show.
    this.sentStates.delete(item.id);
    this.resetBox(item.id, sent);
  }

  /**
   * Puts the clicked box back to what the data says. `[checked]` is a one-way binding: when a
   * click's change never shows in the data (refused, or merged with someone else's) the bound
   * value never changes, and the box would keep the state the click gave it. After the next
   * render: until the box has rendered the click, setting it back would render no change either.
   */
  private resetBox(id: string, sent: SentState): void {
    const box = sent.box;
    if (!box) return;
    afterNextRender(
      {
        write: () => {
          const view = this.view();
          const row =
            view.kind === 'ready'
              ? view.items.find((i) => i.id === id)
              : undefined;
          if (row) box.checked = row.state === 'checked';
        },
      },
      // Not tied to this view, so it schedules a render of its own.
      { injector: this.environment },
    );
  }

  protected print(): void {
    this.transfers.print();
  }

  protected async rename(): Promise<void> {
    const view = this.view();
    if (view.kind !== 'ready') return;
    const ref = this.dialog.open<TitleDialog, TitleDialogData, string>(
      TitleDialog,
      {
        data: {
          heading: 'Rename run',
          confirm: 'Rename',
          title: view.run.title,
        },
        autoFocus: 'first-tabbable',
      },
    );
    const title = await firstValueFrom(ref.afterClosed());
    if (title && title !== view.run.title)
      await this.changes.apply({
        name: 'run.update',
        args: { id: view.run.id, patch: { title } },
      });
  }

  /**
   * "Save as list" (D13): a new reusable list with copies of this run's items, in the order shown
   * (sections, ignoring the Done toggle). Only ever offered here, never suggested; the run stays
   * as it is.
   */
  protected async saveAsList(): Promise<void> {
    const view = this.view();
    if (view.kind !== 'ready') return;
    const ref = this.dialog.open<TitleDialog, TitleDialogData, string>(
      TitleDialog,
      {
        data: {
          heading: 'Save as list',
          confirm: 'Save',
          title: view.run.title,
        },
        autoFocus: 'first-tabbable',
      },
    );
    const title = await firstValueFrom(ref.afterClosed());
    if (!title) return;
    // The run as it is now: items may have been added or moved while the dialog was open.
    const now = this.view();
    if (now.kind !== 'ready') return;
    const { sections } = layoutRun(now.items, () => undefined, false);
    const items = sections.flatMap((section) =>
      section.rows.map(({ item }) => ({ from: item.id, id: newId() })),
    );
    const listId = newId();
    const saved = await this.changes.apply({
      name: 'run.saveAsList',
      args: { runId: now.run.id, listId, title, items },
    });
    if (!saved) return;
    const outcome = await this.notifier.notify({
      message: `Saved “${title}” as a list`,
      action: 'Open',
      duration: NOTICE_DURATION_MS,
    });
    if (outcome === 'action') await this.router.navigate(['/lists', listId]);
  }

  /** "Anna · 14:02" for an item that was checked or skipped; `undefined` otherwise. */
  protected checkedBy(item: RunItem): string | undefined {
    if (item.state === 'unchecked' || !item.stateBy || item.stateAt === null)
      return undefined;
    return attribution(
      this.space.memberName(item.spaceId, item.stateBy),
      item.stateAt,
    );
  }

  /** Edits an item of this run only; the list it came from stays as it is. */
  protected async edit(item: RunItem): Promise<void> {
    const ref = this.dialog.open<
      ItemDialog,
      ItemDialogData,
      Partial<ItemFields>
    >(ItemDialog, {
      data: {
        title: item.title,
        quantity: item.quantity,
        note: item.note,
        notice: item.sources.length > 0 ? 'Changes this run only' : undefined,
        editedBy: attribution(
          this.space.memberName(item.spaceId, item.updatedBy),
          item.updatedAt,
        ),
        deleted: this.removedNotice(item.id),
        restore: () =>
          this.changes.apply({
            name: 'runItem.restore',
            args: { id: item.id },
          }),
      },
      autoFocus: 'first-tabbable',
    });
    this.editingId.set(item.id);
    const patch = await firstValueFrom(ref.afterClosed());
    this.editingId.set(undefined);
    if (patch)
      await this.changes.apply({
        name: 'runItem.update',
        args: { id: item.id, patch },
      });
  }

  /**
   * "Removed by Ben" once someone removes the item being edited (live), so the dialog doesn't
   * save a change that would be ignored (design §2.4). A merged-away item isn't removed: its
   * changes apply to the item it became part of (D16).
   */
  private removedNotice(id: string): Signal<string | undefined> {
    return computed(() => {
      const row = this.editing();
      if (row.status !== 'ready' || row.value?.id !== id) return undefined;
      const { deletedAt, mergedInto, spaceId, updatedBy } = row.value;
      if (deletedAt === null || mergedInto !== null) return undefined;
      const me = this.me();
      const by =
        me.status === 'ready' && me.value === updatedBy
          ? 'you'
          : (this.space.memberName(spaceId, updatedBy) ?? 'someone');
      return `Removed by ${by}`;
    });
  }

  protected async remove(item: RunItem): Promise<void> {
    const change: SpaceChange = {
      name: 'runItem.remove',
      args: { id: item.id },
    };
    // Removing the last unchecked item finishes the run, too.
    const finishes = this.finishes((items) =>
      items.filter((i) => i.id !== item.id),
    );
    if (finishes) this.finishedHere = true;
    const view = this.view();
    const message =
      finishes && view.kind === 'ready'
        ? `Removed “${item.title}”: “${view.run.title}” is finished`
        : `Removed “${item.title}”`;
    const applied = await this.changes.withUndo(change, message, {
      name: 'runItem.restore',
      args: { id: item.id },
    });
    if (finishes && !applied) this.finishedHere = false;
  }

  /** Adds the typed item (Enter or the + button); an identical item is merged (D16). */
  protected add(event: Event): void {
    event.preventDefault();
    this.addAndClear(() => this.draft().title.trim());
  }

  /** A suggestion was chosen (D22): its title is added, nothing else. */
  protected addChosen(title: string): void {
    this.addAndClear(() => title);
  }

  /**
   * Adds one title and empties the field. `submit()` ignores a submit while one is running, so a
   * quick second Enter (also right after choosing a suggestion) doesn't add the item twice.
   */
  private addAndClear(title: () => string): void {
    void submit(this.addForm, async () => {
      const text = title();
      if (text && (await this.addTitles([text]))) this.draft.set({ title: '' });
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
    void this.addTitles(lines);
  }

  /** "Add list": copies a list's items (included lists' too) into this run as a new section. */
  protected async addList(): Promise<void> {
    const view = this.view();
    const lists = this.spaceLists();
    const composition = this.composition();
    if (
      view.kind !== 'ready' ||
      lists.status !== 'ready' ||
      composition.status !== 'ready'
    ) {
      this.changes.tell("Can't add a list right now: try again in a moment");
      return;
    }
    const ref = this.dialog.open<ListPickerDialog, ListPickerData, string>(
      ListPickerDialog,
      {
        data: { lists: lists.value.map(({ id, title }) => ({ id, title })) },
        autoFocus: 'first-tabbable',
      },
    );
    const listId = await firstValueFrom(ref.afterClosed());
    if (!listId) return;
    const items = runItemsFromList(listId, composition.value, newId);
    if (items.length === 0) {
      const title = composition.value.list(listId)?.title ?? 'This list';
      this.changes.tell(`“${title}” has no items`);
      return;
    }
    await this.changes.apply({
      name: 'run.addItems',
      args: { runId: view.run.id, items },
    });
  }

  /**
   * "Sort A–Z" (D17): sorts the items within each section. The sections keep their places, and
   * Undo sends the old positions back.
   */
  protected async sort(): Promise<void> {
    const view = this.view();
    if (view.kind !== 'ready') return;
    const { sections } = layoutRun(view.items, () => undefined, false);
    // The other sections' items share the key space: tied keys get fresh ones between the
    // nearest keys of the whole run, so a section never takes another section's keys.
    const changes = sections.flatMap((section) => {
      const rows = section.rows.map(({ item }) => item);
      const own = new Set(rows.map((item) => item.id));
      return sortByTitle(
        rows,
        view.items.filter((item) => !own.has(item.id)),
      );
    });
    if (changes.length === 0) {
      this.changes.tell('Already in A–Z order');
      return;
    }
    const before = new Map(view.items.map((item) => [item.id, item.position]));
    const runId = view.run.id;
    await this.changes.withUndo(
      { name: 'run.sortItems', args: { runId, items: changes } },
      `Sorted “${view.run.title}” A–Z`,
      {
        name: 'run.sortItems',
        args: {
          runId,
          items: changes.map(({ id }) => ({
            id,
            position: before.get(id) as string,
          })),
        },
      },
    );
  }

  private addTitles(titles: string[]): Promise<boolean> {
    // "Sort in" (D17): among the items typed into the run, before the first that sorts after.
    // Each title counts the ones before it, so a pasted batch comes out sorted.
    const view = this.view();
    const positions: (string | undefined)[] = [];
    if (this.addOrder.order() === 'sorted' && view.kind === 'ready') {
      const all = view.items.map(({ id, title, position, sources }) => ({
        id,
        title,
        position,
        typed: sources.length === 0,
      }));
      for (const title of titles) {
        const position = positionForSortedInsert(
          title,
          all.filter((row) => row.typed),
          all,
        );
        positions.push(position);
        all.push({ id: newId(), title, position, typed: true });
      }
    }
    return this.changes.apply({
      name: 'run.addItems',
      args: {
        runId: this.runId(),
        items: titles.map((title, i) => ({
          id: newId(),
          title,
          quantity: '',
          note: '',
          sources: [],
          position: positions[i],
        })),
      },
    });
  }

  /** Whether the run, now active, would be finished after `change` to its items. */
  private finishes(change: (items: RunItem[]) => RunItem[]): boolean {
    const view = this.view();
    if (view.kind !== 'ready') return false;
    // Still showing the state from before: count the one sent instead. The effect in the
    // constructor forgets sent states, since it also puts their boxes back.
    const items = view.items.map((item) => {
      const sent = this.sentStates.get(item.id);
      return sent && this.stillShows(item, sent)
        ? { ...item, state: sent.to }
        : item;
    });
    return isRunFinished(change(items));
  }

  /**
   * Whether the local row still shows the state from before a sent state. Another `stateAt` means
   * a later change, even one back to the same state (someone undid it before this page saw ours).
   */
  private stillShows(item: RunItem | undefined, sent: SentState): boolean {
    return item?.state === sent.from && item.stateAt === sent.stateAt;
  }

  /**
   * A change that finishes the run: gone from here, with Undo in the snackbar (D10). Resolves
   * whether it was applied.
   */
  private async finish(
    change: SpaceChange,
    undo: SpaceChange,
  ): Promise<boolean> {
    const view = this.view();
    const title = view.kind === 'ready' ? view.run.title : 'Run';
    this.finishedHere = true;
    const applied = await this.changes.withUndo(
      change,
      `Finished “${title}”`,
      undo,
    );
    if (!applied) this.finishedHere = false;
    return applied;
  }
}
