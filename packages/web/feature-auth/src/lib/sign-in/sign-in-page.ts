import { Component, inject, input, signal } from '@angular/core';
import { FormField, form, required, submit } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import type { CurrentUser } from '@lister/shared/api-contracts';
import {
  AuthSession,
  PageNavigator,
  Passkeys,
  describeAuthError,
  describePasskeyError,
} from '@lister/web/data-access-auth';
import { PasskeyWaiting } from '../passkey-waiting/passkey-waiting';
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
    MatIcon,
    MatInput,
    MatLabel,
    PasskeyWaiting,
    RouterLink,
  ],
  templateUrl: './sign-in-page.html',
  styleUrl: '../auth-page.scss',
})
export class SignInPage {
  private readonly session = inject(AuthSession);
  private readonly navigator = inject(PageNavigator);
  private readonly router = inject(Router);
  private readonly passkeys = inject(Passkeys);

  /** From the query string: the page the user wanted before they were sent here. */
  readonly returnUrl = input<string>();

  private readonly model = signal({ username: '', password: '' });
  protected readonly signInForm = form(this.model, (path) => {
    required(path.username, { message: 'Enter your username' });
    required(path.password, { message: 'Enter your password' });
  });
  /** A password sign-in is in flight. */
  protected readonly busy = signal(false);
  /** A passkey ceremony is waiting for the authenticator (it can take a minute to time out). */
  protected readonly passkeyBusy = signal(false);
  protected readonly error = signal('');
  private ceremony?: AbortController;
  protected readonly passkeysSupported = this.passkeys.supported();

  protected signIn(event: Event): void {
    event.preventDefault();
    this.cancelPasskey();
    this.error.set('');
    void submit(this.signInForm, async () => {
      this.busy.set(true);
      try {
        const { username, password } = this.model();
        const user = await this.session.signIn({
          username: username.trim(),
          password,
        });
        await this.finish(user);
      } catch (error) {
        this.error.set(describeAuthError(error, 'Sign-in failed. Try again.'));
      } finally {
        this.busy.set(false);
      }
    });
  }

  /** No username needed: the authenticator offers the passkeys it has for this site. */
  protected async signInWithPasskey(): Promise<void> {
    this.error.set('');
    const ceremony = new AbortController();
    this.ceremony = ceremony;
    this.passkeyBusy.set(true);
    try {
      await this.finish(await this.session.signInWithPasskey(ceremony.signal));
    } catch (error) {
      // Cancelled by the user (or by starting a password sign-in): nothing to explain.
      if (!ceremony.signal.aborted) {
        this.error.set(
          describePasskeyError(error, 'Passkey sign-in failed. Try again.'),
        );
      }
    } finally {
      if (this.ceremony === ceremony) {
        this.ceremony = undefined;
        this.passkeyBusy.set(false);
      }
    }
  }

  /** Stops a passkey ceremony nobody is answering, and gives the page back at once. */
  protected cancelPasskey(): void {
    if (!this.ceremony) return;
    this.ceremony.abort();
    this.ceremony = undefined;
    this.passkeyBusy.set(false);
    void this.passkeys.cancel();
  }

  /** After either way of signing in: change a temporary password first, else go where asked. */
  private async finish(user: CurrentUser): Promise<void> {
    if (user.mustChangePassword) {
      await this.router.navigateByUrl('/change-password');
    } else {
      this.navigator.load(safeReturnUrl(this.returnUrl()));
    }
  }
}
