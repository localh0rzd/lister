import { Component, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { RegisterRequest } from '@lister/shared/api-contracts';
import {
  AuthSession,
  PageNavigator,
  describeAuthError,
} from '@lister/web/data-access-auth';
import { AccountForm } from '../account-form/account-form';

/**
 * Registration with a token an admin handed out (D23), opened from `/register?token=…`: like
 * first-run setup, but the new account is a regular user. They are signed in at once.
 */
@Component({
  selector: 'lister-register-page',
  imports: [AccountForm, RouterLink],
  templateUrl: './register-page.html',
  styleUrl: '../auth-page.scss',
})
export class RegisterPage {
  private readonly session = inject(AuthSession);
  private readonly navigator = inject(PageNavigator);

  /**
   * The `token` query parameter (bound from the route), which the form starts with. The router
   * sets it to `undefined` when the link has no token, so that becomes an empty field.
   */
  readonly token = input('', {
    transform: (value: string | undefined) => value ?? '',
  });
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected async register(request: RegisterRequest): Promise<void> {
    this.error.set('');
    this.busy.set(true);
    try {
      await this.session.register(request);
      this.navigator.load('/');
    } catch (error) {
      this.error.set(
        describeAuthError(error, 'Registration failed. Try again.'),
      );
    } finally {
      this.busy.set(false);
    }
  }
}
