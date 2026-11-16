import { Component, input, linkedSignal, output } from '@angular/core';
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
  MatError,
  MatFormField,
  MatHint,
  MatLabel,
} from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import {
  AUTH_LIMITS,
  type RegisterRequest,
  USERNAME_PATTERN,
} from '@lister/shared/api-contracts';

/**
 * The form of first-run setup and of registration: a token (the setup token from the server
 * log, or a registration token), username, display name and password, checked by the same rules
 * as the server. It emits the trimmed values and leaves the request to the page.
 */
@Component({
  selector: 'lister-account-form',
  imports: [
    FormField,
    MatButton,
    MatError,
    MatFormField,
    MatHint,
    MatInput,
    MatLabel,
  ],
  templateUrl: './account-form.html',
  styleUrl: './account-form.scss',
})
export class AccountForm {
  readonly tokenLabel = input.required<string>();
  /** Said under the token field when it is empty. */
  readonly tokenMissing = input.required<string>();
  readonly submitLabel = input.required<string>();
  /** Fills the token field, e.g. from the link that was opened. */
  readonly initialToken = input('');
  readonly busy = input(false);
  /** Why the last attempt failed, shown under the fields. */
  readonly error = input('');
  readonly submitted = output<RegisterRequest>();

  private readonly model = linkedSignal(() => ({
    token: this.initialToken(),
    username: '',
    displayName: '',
    password: '',
  }));
  protected readonly limits = AUTH_LIMITS;
  protected readonly accountForm = form(this.model, (path) => {
    required(path.token, { message: () => this.tokenMissing() });
    required(path.username, { message: 'Choose a username' });
    maxLength(path.username, AUTH_LIMITS.usernameMax, {
      message: 'That username is too long',
    });
    pattern(path.username, USERNAME_PATTERN, {
      message: 'Use letters, digits, ".", "_" and "-" only',
    });
    required(path.displayName, { message: 'Enter your name' });
    pattern(path.displayName, /\S/, { message: 'Enter your name' });
    maxLength(path.displayName, AUTH_LIMITS.displayNameMax, {
      message: 'That name is too long',
    });
    minLength(path.password, AUTH_LIMITS.passwordMin, {
      message: `Use at least ${AUTH_LIMITS.passwordMin} characters`,
    });
    maxLength(path.password, AUTH_LIMITS.passwordMax, {
      message: 'That password is too long',
    });
  });

  protected send(event: Event): void {
    event.preventDefault();
    void submit(this.accountForm, async () => {
      const { token, username, displayName, password } = this.model();
      this.submitted.emit({
        token: token.trim(),
        username: username.trim(),
        displayName: displayName.trim(),
        password,
      });
    });
  }
}
