import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { SetupRequest } from '@lister/shared/api-contracts';
import {
  AuthSession,
  PageNavigator,
  describeAuthError,
} from '@lister/web/data-access-auth';
import { AccountForm } from '../account-form/account-form';

/** First-run setup: the one-time token from the server log creates the first account, an admin. */
@Component({
  selector: 'lister-setup-page',
  imports: [AccountForm, RouterLink],
  templateUrl: './setup-page.html',
  styleUrl: '../auth-page.scss',
})
export class SetupPage {
  private readonly session = inject(AuthSession);
  private readonly navigator = inject(PageNavigator);

  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected async setUp(request: SetupRequest): Promise<void> {
    this.error.set('');
    this.busy.set(true);
    try {
      await this.session.setUp(request);
      this.navigator.load('/');
    } catch (error) {
      this.error.set(describeAuthError(error, 'Setup failed. Try again.'));
    } finally {
      this.busy.set(false);
    }
  }
}
