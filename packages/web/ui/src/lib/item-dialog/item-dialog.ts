import {
  Component,
  type ElementRef,
  type Signal,
  inject,
  signal,
  viewChild,
} from '@angular/core';
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
   * Live: what someone deleted while the dialog is open, e.g. "Deleted by Ben" or "“Camping”
   * was deleted by Ben"; `undefined` while the item can be changed. Set together with
   * `restore`: the dialog then shows it with Restore and doesn't save (the change would be
   * ignored, design §2.4: delete wins).
   */
  deleted?: Signal<string | undefined>;
  /**
   * Brings back what was deleted; `true` when that worked. The dialog stays open with what the
   * user typed, so they can still save it.
   */
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

  private readonly titleField =
    viewChild.required<ElementRef<HTMLInputElement>>('titleField');

  /** Restores and keeps the typed values; focus goes back to Title (Restore is going away). */
  protected async restore(): Promise<void> {
    if (await this.item.restore?.()) this.titleField().nativeElement.focus();
  }

  protected save(event: Event): void {
    event.preventDefault();
    if (this.item.deleted?.()) return;
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
