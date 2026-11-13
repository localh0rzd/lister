import { Component, inject, signal } from '@angular/core';
import {
  FormField,
  form,
  maxLength,
  minLength,
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
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { AUTH_LIMITS, type CurrentUser } from '@lister/shared/api-contracts';
import { describeAuthError } from '@lister/web/data-access-auth';
import { UsersApi } from '../users-api';

export interface ResetPasswordDialogData {
  user: CurrentUser;
}

/** Sets a new temporary password (D9): the user is signed out everywhere and must change it at the next sign-in. */
@Component({
  selector: 'lister-reset-password-dialog',
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
  templateUrl: './reset-password-dialog.html',
  styleUrl: '../user-dialog/user-dialog.scss',
})
export class ResetPasswordDialog {
  protected readonly data = inject<ResetPasswordDialogData>(MAT_DIALOG_DATA);
  private readonly api = inject(UsersApi);
  private readonly dialog =
    inject<MatDialogRef<ResetPasswordDialog, true>>(MatDialogRef);

  private readonly model = signal({ temporaryPassword: '' });
  protected readonly resetForm = form(this.model, (path) => {
    minLength(path.temporaryPassword, AUTH_LIMITS.passwordMin, {
      message: `Use at least ${AUTH_LIMITS.passwordMin} characters`,
    });
    maxLength(path.temporaryPassword, AUTH_LIMITS.passwordMax, {
      message: 'That password is too long',
    });
  });
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected save(event: Event): void {
    event.preventDefault();
    this.error.set('');
    void submit(this.resetForm, async () => {
      this.busy.set(true);
      try {
        await this.api.resetPassword(this.data.user.id, {
          temporaryPassword: this.model().temporaryPassword,
        });
        this.dialog.close(true);
      } catch (error) {
        this.error.set(
          describeAuthError(error, 'The password was not reset. Try again.'),
        );
      } finally {
        this.busy.set(false);
      }
    });
  }
}
