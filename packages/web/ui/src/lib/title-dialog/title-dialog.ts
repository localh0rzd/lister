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
  template: `
    <h2 mat-dialog-title>{{ data.heading }}</h2>
    <form novalidate (submit)="save($event)">
      <mat-dialog-content>
        <mat-form-field class="field">
          <mat-label>Title</mat-label>
          <input matInput [formField]="titleForm.title" cdkFocusInitial />
          @if (
            titleForm.title().touched() && titleForm.title().errors()[0];
            as error
          ) {
            <mat-error>{{ error.message }}</mat-error>
          }
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit">{{ data.confirm }}</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .field {
      width: 100%;
      min-width: min(320px, 70vw);
    }
  `,
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
