import { Component, type Signal, inject, signal } from '@angular/core';
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

export interface ItemDialogData extends ItemFields {
  /** Shown above the fields, e.g. "Changes “Camping”, also used in 2 other lists". */
  notice?: string;
  /** Who changed the item last and when, e.g. "Anna · 14:02" (see `attribution()`). */
  editedBy?: string;
  /**
   * Who deleted the item while it's open (live), e.g. "Ben"; `undefined` while it exists. Set
   * together with `restore`: the dialog then says "Deleted by Ben", offers Restore and doesn't
   * save (the change would be ignored, design §2.4: delete wins).
   */
  deletedBy?: Signal<string | undefined>;
  /** Brings the item back; `true` when that worked. The dialog closes after it. */
  restore?: () => Promise<boolean>;
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
  templateUrl: './item-dialog.html',
  styleUrl: './item-dialog.scss',
})
export class ItemDialog {
  protected readonly item = inject<ItemDialogData>(MAT_DIALOG_DATA);
  private readonly dialog =
    inject<MatDialogRef<ItemDialog, Partial<ItemFields>>>(MatDialogRef);

  private readonly model = signal<ItemFields>({
    title: this.item.title,
    quantity: this.item.quantity,
    note: this.item.note,
  });
  protected readonly itemForm = form(this.model, (path) => {
    validateStandardSchema(path.title, titleSchema);
    validateStandardSchema(path.quantity, quantitySchema);
    validateStandardSchema(path.note, noteSchema);
  });

  protected async restore(): Promise<void> {
    if (await this.item.restore?.()) this.dialog.close();
  }

  protected save(event: Event): void {
    event.preventDefault();
    if (this.item.deletedBy?.()) return;
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
