import { Component, inject, signal } from '@angular/core';
import {
  FormField,
  form,
  submit,
  validateStandardSchema,
} from '@angular/forms/signals';
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
  MatError,
  MatFormField,
  MatHint,
  MatLabel,
} from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import {
  noteSchema,
  quantitySchema,
  titleSchema,
} from '@lister/shared/sync-protocol';

export interface ItemFields {
  title: string;
  quantity: string;
  note: string;
}

/**
 * Edits an item's title, quantity (free text, empty means 1, D6) and note. Closes with only the
 * fields that changed (trimmed), or `undefined` when cancelled or nothing changed. Validation is
 * the shared Zod schemas the server applies.
 */
@Component({
  selector: 'lister-item-dialog',
  imports: [
    FormField,
    MatButton,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatError,
    MatFormField,
    MatHint,
    MatInput,
    MatLabel,
  ],
  template: `
    <h2 mat-dialog-title>Edit item</h2>
    <form novalidate (submit)="save($event)">
      <mat-dialog-content class="fields">
        <mat-form-field>
          <mat-label>Title</mat-label>
          <input matInput [formField]="itemForm.title" cdkFocusInitial />
          @if (
            itemForm.title().touched() && itemForm.title().errors()[0];
            as error
          ) {
            <mat-error>{{ error.message }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field>
          <mat-label>Quantity</mat-label>
          <input matInput [formField]="itemForm.quantity" placeholder="1" />
          <mat-hint>Free text, e.g. 2 pairs or 500 g. Empty means 1.</mat-hint>
          @if (
            itemForm.quantity().touched() && itemForm.quantity().errors()[0];
            as error
          ) {
            <mat-error>{{ error.message }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field>
          <mat-label>Note</mat-label>
          <textarea matInput [formField]="itemForm.note" rows="3"></textarea>
          @if (
            itemForm.note().touched() && itemForm.note().errors()[0];
            as error
          ) {
            <mat-error>{{ error.message }}</mat-error>
          }
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit">Save</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .fields {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: min(360px, 75vw);
    }
  `,
})
export class ItemDialog {
  private readonly item = inject<ItemFields>(MAT_DIALOG_DATA);
  private readonly dialog =
    inject<MatDialogRef<ItemDialog, Partial<ItemFields>>>(MatDialogRef);

  private readonly model = signal<ItemFields>({ ...this.item });
  protected readonly itemForm = form(this.model, (path) => {
    validateStandardSchema(path.title, titleSchema);
    validateStandardSchema(path.quantity, quantitySchema);
    validateStandardSchema(path.note, noteSchema);
  });

  protected save(event: Event): void {
    event.preventDefault();
    void submit(this.itemForm, async () => {
      const value = this.model();
      const patch: Partial<ItemFields> = {};
      for (const key of ['title', 'quantity', 'note'] as const) {
        const trimmed = value[key].trim();
        if (trimmed !== this.item[key]) patch[key] = trimmed;
      }
      this.dialog.close(Object.keys(patch).length > 0 ? patch : undefined);
    });
  }
}
