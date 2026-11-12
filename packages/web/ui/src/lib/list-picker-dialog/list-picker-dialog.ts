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
import { MatActionList, MatListItem } from '@angular/material/list';

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
    MatPrefix,
  ],
  template: `
    <h2 mat-dialog-title>Add list</h2>
    <mat-dialog-content class="content">
      <mat-form-field class="search" subscriptSizing="dynamic">
        <mat-label>Search lists</mat-label>
        <mat-icon matPrefix aria-hidden="true">search</mat-icon>
        <input
          matInput
          type="search"
          [value]="query()"
          (input)="search($event)"
          (keydown.enter)="pickFirst($event)"
        />
      </mat-form-field>
      @if (data.lists.length === 0) {
        <p class="hint">No other lists can be added here.</p>
      } @else if (matches().length === 0) {
        <p class="hint">No list matches “{{ query() }}”.</p>
      } @else {
        <mat-action-list aria-label="Lists">
          @for (list of matches(); track list.id) {
            <button mat-list-item type="button" (click)="pick(list)">
              {{ list.title }}
            </button>
          }
        </mat-action-list>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close>Cancel</button>
    </mat-dialog-actions>
  `,
  styles: `
    .content {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: min(360px, 75vw);
    }
    .search {
      width: 100%;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
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
