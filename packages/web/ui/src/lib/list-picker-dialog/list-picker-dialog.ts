import { Component, computed, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import {
  MatFormField,
  MatLabel,
  MatPrefix,
} from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import {
  MatActionList,
  MatListItem,
  MatListItemTitle,
} from '@angular/material/list';
import { TruncatedTooltip } from '../truncated-tooltip/truncated-tooltip';

export interface ListChoice {
  id: string;
  title: string;
}

export interface ListPickerData {
  /** The lists that may be chosen, in display order (the caller leaves out the others). */
  lists: readonly ListChoice[];
}

/** Lower case without accents, so "cafe" finds "Café". */
const fold = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('en');

/** Picks one list, with a search field. Closes with the list's id, or `undefined` if cancelled. */
@Component({
  selector: 'lister-list-picker-dialog',
  imports: [
    MatActionList,
    MatButton,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatFormField,
    MatIcon,
    MatInput,
    MatLabel,
    MatListItem,
    MatListItemTitle,
    MatPrefix,
    TruncatedTooltip,
  ],
  templateUrl: './list-picker-dialog.html',
  styleUrl: './list-picker-dialog.scss',
})
export class ListPickerDialog {
  protected readonly data = inject<ListPickerData>(MAT_DIALOG_DATA);
  private readonly dialog =
    inject<MatDialogRef<ListPickerDialog, string>>(MatDialogRef);

  protected readonly query = signal('');
  protected readonly matches = computed(() => {
    const query = fold(this.query().trim());
    return query
      ? this.data.lists.filter((list) => fold(list.title).includes(query))
      : this.data.lists;
  });

  protected search(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected pick(list: ListChoice): void {
    this.dialog.close(list.id);
  }

  /** Enter in the search field picks the first match. */
  protected pickFirst(event: Event): void {
    event.preventDefault();
    const first = this.matches()[0];
    if (first) this.pick(first);
  }
}
