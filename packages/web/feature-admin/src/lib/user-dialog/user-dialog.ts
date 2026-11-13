import { Component, computed, inject, signal } from '@angular/core';
import {
  FormField,
  form,
  maxLength,
  minLength,
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
import {
  AUTH_LIMITS,
  type CurrentUser,
  USERNAME_PATTERN,
} from '@lister/shared/api-contracts';
import { describeAuthError } from '@lister/web/data-access-auth';
import { UsersApi } from '../users-api';

export interface UserDialogData {
  /** The user to edit; leave it out to create one. */
  user?: CurrentUser;
}

/** Creates a user (with a temporary password) or edits a user's username and display name. */
@Component({
  selector: 'lister-user-dialog',
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
  templateUrl: './user-dialog.html',
  styleUrl: './user-dialog.scss',
})
export class UserDialog {
  private readonly data = inject<UserDialogData>(MAT_DIALOG_DATA);
  private readonly api = inject(UsersApi);
  private readonly dialog =
    inject<MatDialogRef<UserDialog, CurrentUser>>(MatDialogRef);

  protected readonly editing = this.data.user;
  protected readonly limits = AUTH_LIMITS;
  private readonly model = signal({
    username: this.data.user?.username ?? '',
    displayName: this.data.user?.displayName ?? '',
    temporaryPassword: '',
  });
  protected readonly userForm = form(this.model, (path) => {
    required(path.username, { message: 'Choose a username' });
    maxLength(path.username, AUTH_LIMITS.usernameMax, {
      message: 'That username is too long',
    });
    pattern(path.username, USERNAME_PATTERN, {
      message: 'Use letters, digits, ".", "_" and "-" only',
    });
    required(path.displayName, { message: 'Enter a name' });
    pattern(path.displayName, /\S/, { message: 'Enter a name' });
    maxLength(path.displayName, AUTH_LIMITS.displayNameMax, {
      message: 'That name is too long',
    });
    if (!this.data.user) {
      minLength(path.temporaryPassword, AUTH_LIMITS.passwordMin, {
        message: `Use at least ${AUTH_LIMITS.passwordMin} characters`,
      });
      maxLength(path.temporaryPassword, AUTH_LIMITS.passwordMax, {
        message: 'That password is too long',
      });
    }
  });
  protected readonly heading = computed(() =>
    this.editing ? 'Edit user' : 'Add user',
  );
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected save(event: Event): void {
    event.preventDefault();
    this.error.set('');
    void submit(this.userForm, async () => {
      this.busy.set(true);
      try {
        const { username, displayName, temporaryPassword } = this.model();
        const body = {
          username: username.trim(),
          displayName: displayName.trim(),
        };
        const saved = this.editing
          ? await this.api.update(this.editing.id, body)
          : await this.api.create({ ...body, temporaryPassword });
        this.dialog.close(saved);
      } catch (error) {
        this.error.set(
          describeAuthError(error, 'The user was not saved. Try again.'),
        );
      } finally {
        this.busy.set(false);
      }
    });
  }
}
