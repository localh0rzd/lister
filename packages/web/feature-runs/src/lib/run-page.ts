import {
  Component,
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
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { Router, RouterLink } from '@angular/router';
import {
  type RunItem,
  type RunItemState,
  isRunFinished,
  newId,
  runItemsFromList,
} from '@lister/shared/domain';
import { titleSchema } from '@lister/shared/sync-protocol';
import { Repositories } from '@lister/web/data-access-local-db';
import { type SpaceChange, SpaceChanges } from '@lister/web/data-access-sync';
import {
  ItemDialog,
  type ItemDialogData,
  type ItemFields,
  ListPickerDialog,
  type ListPickerData,
  LoadingHint,
  TitleDialog,
  type TitleDialogData,
} from '@lister/web/ui';
import { firstValueFrom } from 'rxjs';
import { DoneSectionPreference } from './done-section-preference';
import { layoutRun, progressText } from './run-sections';

/**
 * One run (design §2.1): its items grouped by the list they came from, with check, uncheck and
 * skip, and a progress bar. Items and whole lists can be added, items edited and removed — all
 * only in this run. Once everything is checked or skipped the run finishes and this page goes
 * back to the Runs page; the snackbar offers Undo, which reverts the change that finished it.
 */
@Component({
  selector: 'lister-run-page',
  imports: [
    FormField,
    LoadingHint,
    MatButton,
    MatCheckbox,
    MatFormField,
    MatIcon,
    MatIconButton,
    MatInput,
    MatLabel,
    MatMenu,
    MatMenuItem,
    MatMenuTrigger,
    MatProgressBar,
    MatSlideToggle,
    NgTemplateOutlet,
    RouterLink,
  ],
  templateUrl: './run-page.html',
  styleUrl: './run-page.scss',
})
export class RunPage {
  /** From the route (`runs/:runId`). */
  readonly runId = input.required<string>();

  private readonly repositories = inject(Repositories);
  private readonly changes = inject(SpaceChanges);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  protected readonly doneSection = inject(DoneSectionPreference);

  private readonly run = this.repositories.run(this.runId);
  private readonly items = this.repositories.itemsOfRun(this.runId);
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
   * States set here that the local data may not show yet (item id → from, to). Two quick checks
   * would otherwise each see the other item unchecked, and the one that finishes the run would
   * not know it.
   */
  private readonly sentStates = new Map<
    string,
    { from: RunItemState; to: RunItemState }
  >();

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

  constructor() {
    const title = inject(Title);
    // A sent state is done with once the local data shows anything else than the state before
    // it: kept longer, a later change by someone else back to that state would count as sent.
    effect(() => {
      const items = this.items();
      if (items.status !== 'ready') return;
      const states = new Map(items.value.map((item) => [item.id, item.state]));
      for (const [id, sent] of this.sentStates) {
        if (states.get(id) !== sent.from) this.sentStates.delete(id);
      }
    });
    effect(() => {
      const view = this.view();
      if (view.kind === 'ready') title.setTitle(`${view.run.title} · Lister`);
      // Finished, here or by someone else: it appears nowhere any more (D10).
      if (view.kind === 'finished') {
        if (!this.finishedHere)
          this.changes.tell(`“${view.run.title}” is finished`);
        void this.router.navigate(['/runs']);
      }
    });
  }

  /** Check or uncheck (the checkbox): always sets the state, never toggles. */
  protected check(item: RunItem, checked: boolean): Promise<void> {
    return this.setState(item, checked ? 'checked' : 'unchecked');
  }

  protected async setState(item: RunItem, state: RunItemState): Promise<void> {
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
    this.sentStates.set(item.id, { from: item.state, to: state });
    const applied = finishes
      ? await this.finish(change, undo)
      : await this.changes.apply(change);
    if (!applied) this.sentStates.delete(item.id);
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
      },
      autoFocus: 'first-tabbable',
    });
    const patch = await firstValueFrom(ref.afterClosed());
    if (patch)
      await this.changes.apply({
        name: 'runItem.update',
        args: { id: item.id, patch },
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
    const applied = await this.changes.withUndo(
      change,
      `Removed “${item.title}”`,
      { name: 'runItem.restore', args: { id: item.id } },
    );
    if (finishes && !applied) this.finishedHere = false;
  }

  /** Adds the typed item (Enter or the + button); an identical item is merged (D16). */
  protected add(event: Event): void {
    event.preventDefault();
    void submit(this.addForm, async () => {
      const title = this.draft().title.trim();
      if (!title) return;
      if (await this.addTitles([title])) this.draft.set({ title: '' });
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

  private addTitles(titles: string[]): Promise<boolean> {
    return this.changes.apply({
      name: 'run.addItems',
      args: {
        runId: this.runId(),
        items: titles.map((title) => ({
          id: newId(),
          title,
          quantity: '',
          note: '',
          sources: [],
        })),
      },
    });
  }

  /** Whether the run, now active, would be finished after `change` to its items. */
  private finishes(change: (items: RunItem[]) => RunItem[]): boolean {
    const view = this.view();
    if (view.kind !== 'ready') return false;
    const items = view.items.map((item) => {
      const sent = this.sentStates.get(item.id);
      // Still showing the state from before: count the one sent instead.
      if (sent && item.state === sent.from) return { ...item, state: sent.to };
      this.sentStates.delete(item.id);
      return item;
    });
    return isRunFinished(change(items));
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
