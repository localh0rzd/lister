import { Component, inject, input, output, signal } from '@angular/core';
import {
  FormField,
  form,
  maxLength,
  minLength,
  required,
  submit,
  validate,
} from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import {
  MatError,
  MatFormField,
  MatHint,
  MatLabel,
} from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { AUTH_LIMITS } from '@lister/shared/api-contracts';
import { AuthSession, describeAuthError } from '@lister/web/data-access-auth';

/** Current password, new password twice. Used for the forced change after sign-in and on the profile. */
@Component({
  selector: 'lister-password-form',
  imports: [
    FormField,
    MatButton,
    MatError,
    MatFormField,
    MatHint,
    MatInput,
    MatLabel,
  ],
  templateUrl: './password-form.html',
  styleUrl: '../auth-page.scss',
})
export class PasswordForm {
  private readonly session = inject(AuthSession);

  /** Labels the current password a "temporary password" (the first sign-in after an admin set it). */
  readonly forced = input(false);
  /** The password was changed. */
  readonly changed = output<void>();

  private readonly model = signal({ current: '', next: '', confirm: '' });
  protected readonly limits = AUTH_LIMITS;
  protected readonly passwordForm = form(this.model, (path) => {
    required(path.current, { message: 'Enter your current password' });
    minLength(path.next, AUTH_LIMITS.passwordMin, {
      message: `Use at least ${AUTH_LIMITS.passwordMin} characters`,
    });
    maxLength(path.next, AUTH_LIMITS.passwordMax, {
      message: 'That password is too long',
    });
    validate(path.next, ({ value, valueOf }) =>
      value() !== '' && value() === valueOf(path.current)
        ? {
            kind: 'same',
            message: 'The new password must differ from the current one',
          }
        : undefined,
    );
    validate(path.confirm, ({ value, valueOf }) =>
      value() !== valueOf(path.next)
        ? { kind: 'mismatch', message: 'The passwords do not match' }
        : undefined,
    );
  });
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected change(event: Event): void {
    event.preventDefault();
    this.error.set('');
    void submit(this.passwordForm, async () => {
      this.busy.set(true);
      try {
        const { current, next } = this.model();
        await this.session.changePassword({
          currentPassword: current,
          newPassword: next,
        });
        this.model.set({ current: '', next: '', confirm: '' });
        this.passwordForm().reset();
        this.changed.emit();
      } catch (error) {
        this.error.set(
          describeAuthError(error, 'The password was not changed. Try again.'),
        );
      } finally {
        this.busy.set(false);
      }
    });
  }
}
