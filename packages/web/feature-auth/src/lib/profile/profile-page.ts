import { Component, computed, effect, inject, signal } from '@angular/core';
import {
  FormField,
  form,
  maxLength,
  pattern,
  required,
  submit,
} from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { AUTH_LIMITS } from '@lister/shared/api-contracts';
import { AuthSession, describeAuthError } from '@lister/web/data-access-auth';
import { NOTICE_DURATION_MS, Notifier } from '@lister/web/util-notify';
import { PasswordForm } from '../password/password-form';
import { PasskeysSection } from '../passkeys/passkeys-section';

/** The signed-in user's profile: display name, password and passkeys. */
@Component({
  selector: 'lister-profile-page',
  imports: [
    FormField,
    MatButton,
    MatError,
    MatFormField,
    MatIcon,
    MatInput,
    MatLabel,
    PasskeysSection,
    PasswordForm,
    RouterLink,
  ],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.scss',
})
export class ProfilePage {
  private readonly session = inject(AuthSession);
  private readonly notifier = inject(Notifier);

  protected readonly user = this.session.user;
  protected readonly username = computed(() => this.user()?.username ?? '');

  private readonly model = signal({
    displayName: this.user()?.displayName ?? '',
  });
  protected readonly profileForm = form(this.model, (path) => {
    required(path.displayName, { message: 'Enter your name' });
    pattern(path.displayName, /\S/, { message: 'Enter your name' });
    maxLength(path.displayName, AUTH_LIMITS.displayNameMax, {
      message: 'That name is too long',
    });
  });
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly unchanged = computed(
    () => this.model().displayName.trim() === this.user()?.displayName,
  );

  constructor() {
    // The user is known after the guard has run; keep the field in step with the session.
    effect(() => {
      const name = this.user()?.displayName;
      if (name !== undefined) this.model.set({ displayName: name });
    });
  }

  protected save(event: Event): void {
    event.preventDefault();
    this.error.set('');
    void submit(this.profileForm, async () => {
      this.busy.set(true);
      try {
        await this.session.updateProfile({
          displayName: this.model().displayName.trim(),
        });
        void this.notifier.notify({
          message: 'Name saved',
          duration: NOTICE_DURATION_MS,
        });
      } catch (error) {
        this.error.set(
          describeAuthError(error, 'The name was not saved. Try again.'),
        );
      } finally {
        this.busy.set(false);
      }
    });
  }

  protected passwordChanged(): void {
    void this.notifier.notify({
      message: 'Password changed',
      duration: NOTICE_DURATION_MS,
    });
  }
}
