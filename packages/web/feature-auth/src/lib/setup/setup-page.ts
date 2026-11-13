import { Component, inject, signal } from '@angular/core';
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
import { RouterLink } from '@angular/router';
import { AUTH_LIMITS, USERNAME_PATTERN } from '@lister/shared/api-contracts';
import {
  AuthSession,
  PageNavigator,
  describeAuthError,
} from '@lister/web/data-access-auth';

/** First-run setup: the one-time token from the server log creates the first account, an admin. */
@Component({
  selector: 'lister-setup-page',
  imports: [
    FormField,
    MatButton,
    MatError,
    MatFormField,
    MatHint,
    MatInput,
    MatLabel,
    RouterLink,
  ],
  templateUrl: './setup-page.html',
  styleUrl: '../auth-page.scss',
})
export class SetupPage {
  private readonly session = inject(AuthSession);
  private readonly navigator = inject(PageNavigator);

  private readonly model = signal({
    token: '',
    username: '',
    displayName: '',
    password: '',
  });
  protected readonly limits = AUTH_LIMITS;
  protected readonly setupForm = form(this.model, (path) => {
    required(path.token, {
      message: 'Enter the setup token from the server log',
    });
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
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected setUp(event: Event): void {
    event.preventDefault();
    this.error.set('');
    void submit(this.setupForm, async () => {
      this.busy.set(true);
      try {
        const { token, username, displayName, password } = this.model();
        await this.session.setUp({
          token: token.trim(),
          username: username.trim(),
          displayName: displayName.trim(),
          password,
        });
        this.navigator.load('/');
      } catch (error) {
        this.error.set(describeAuthError(error, 'Setup failed. Try again.'));
      } finally {
        this.busy.set(false);
      }
    });
  }
}
