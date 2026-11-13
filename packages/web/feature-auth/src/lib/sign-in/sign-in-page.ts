import { Component, inject, input, signal } from '@angular/core';
import { FormField, form, required, submit } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import {
  AuthSession,
  PageNavigator,
  describeAuthError,
} from '@lister/web/data-access-auth';
import { safeReturnUrl } from '../safe-url';

/**
 * Sign-in with username and password. A full page load follows, so nothing of whoever used the
 * app before stays in memory; pending changes in the local database stay and sync (the same
 * user) or are wiped (another user, see `AuthSession`).
 */
@Component({
  selector: 'lister-sign-in-page',
  imports: [
    FormField,
    MatButton,
    MatError,
    MatFormField,
    MatInput,
    MatLabel,
    RouterLink,
  ],
  templateUrl: './sign-in-page.html',
  styleUrl: '../auth-page.scss',
})
export class SignInPage {
  private readonly session = inject(AuthSession);
  private readonly navigator = inject(PageNavigator);
  private readonly router = inject(Router);

  /** From the query string: the page the user wanted before they were sent here. */
  readonly returnUrl = input<string>();

  private readonly model = signal({ username: '', password: '' });
  protected readonly signInForm = form(this.model, (path) => {
    required(path.username, { message: 'Enter your username' });
    required(path.password, { message: 'Enter your password' });
  });
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected signIn(event: Event): void {
    event.preventDefault();
    this.error.set('');
    void submit(this.signInForm, async () => {
      this.busy.set(true);
      try {
        const { username, password } = this.model();
        const user = await this.session.signIn({
          username: username.trim(),
          password,
        });
        if (user.mustChangePassword) {
          await this.router.navigateByUrl('/change-password');
        } else {
          this.navigator.load(safeReturnUrl(this.returnUrl()));
        }
      } catch (error) {
        this.error.set(describeAuthError(error, 'Sign-in failed. Try again.'));
      } finally {
        this.busy.set(false);
      }
    });
  }
}
