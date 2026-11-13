import { Component, inject, signal } from '@angular/core';
import {
  FormField,
  form,
  maxLength,
  pattern,
  required,
  submit,
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
import { describeAuthError } from '@lister/web/data-access-auth';

export interface FieldDialogData {
  heading: string;
  label: string;
  /** The submit button, e.g. "Create". */
  confirm: string;
  maxLength: number;
  value?: string;
  hint?: string;
  /** Does the work; a rejection is shown in the dialog, which stays open. */
  submit: (value: string) => Promise<void>;
}

/** A one-field dialog that runs its action before it closes (new space, rename, add member). */
@Component({
  selector: 'lister-field-dialog',
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
  templateUrl: './field-dialog.html',
  styleUrl: './field-dialog.scss',
})
export class FieldDialog {
  protected readonly data = inject<FieldDialogData>(MAT_DIALOG_DATA);
  private readonly dialog =
    inject<MatDialogRef<FieldDialog, true>>(MatDialogRef);

  private readonly model = signal({ value: this.data.value ?? '' });
  protected readonly fieldForm = form(this.model, (path) => {
    required(path.value, { message: `Enter ${this.data.label.toLowerCase()}` });
    pattern(path.value, /\S/, {
      message: `Enter ${this.data.label.toLowerCase()}`,
    });
    maxLength(path.value, this.data.maxLength, { message: 'That is too long' });
  });
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected save(event: Event): void {
    event.preventDefault();
    this.error.set('');
    void submit(this.fieldForm, async () => {
      this.busy.set(true);
      try {
        await this.data.submit(this.model().value.trim());
        this.dialog.close(true);
      } catch (error) {
        this.error.set(describeAuthError(error));
      } finally {
        this.busy.set(false);
      }
    });
  }
}
