import { Component, computed, inject } from '@angular/core';
import { AuthSession, PageNavigator } from '@lister/web/data-access-auth';
import { PasswordForm } from './password-form';

/** The forced change: a user whose password an admin set must choose their own before anything else (D9). */
@Component({
  selector: 'lister-change-password-page',
  imports: [PasswordForm],
  templateUrl: './change-password-page.html',
  styleUrl: '../auth-page.scss',
})
export class ChangePasswordPage {
  private readonly navigator = inject(PageNavigator);
  private readonly session = inject(AuthSession);
  protected readonly name = computed(
    () => this.session.user()?.displayName ?? 'Welcome',
  );

  protected done(): void {
    this.navigator.load('/');
  }
}
