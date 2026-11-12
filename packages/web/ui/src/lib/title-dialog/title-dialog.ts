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
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { titleSchema } from '@lister/shared/sync-protocol';

export interface TitleDialogData {
  heading: string;
  /** The submit button, e.g. "Create" or "Rename". */
  confirm: string;
  title?: string;
}

/**
 * Asks for a title (new list, rename). It closes with the trimmed title, or `undefined` when
 * cancelled. Validation is the same Zod schema the server applies.
 */
@Component({
  selector: 'lister-title-dialog',
  imports: [
    FormField,
    MatButton,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatError,
    MatFormField,
    MatInput,
    MatLabel,
  ],
  templateUrl: './title-dialog.html',
  styleUrl: './title-dialog.scss',
})
export class TitleDialog {
  protected readonly data = inject<TitleDialogData>(MAT_DIALOG_DATA);
  private readonly dialog =
    inject<MatDialogRef<TitleDialog, string>>(MatDialogRef);

  private readonly model = signal({ title: this.data.title ?? '' });
  protected readonly titleForm = form(this.model, (path) => {
    validateStandardSchema(path.title, titleSchema);
  });

  /** `submit` marks every field touched and runs the action only when the form is valid. */
  protected save(event: Event): void {
    event.preventDefault();
    void submit(this.titleForm, async () => {
      this.dialog.close(this.model().title.trim());
    });
  }
}
