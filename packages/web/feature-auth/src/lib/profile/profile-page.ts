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
import { MatDialog } from '@angular/material/dialog';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { AUTH_LIMITS } from '@lister/shared/api-contracts';
import { AuthSession, describeAuthError } from '@lister/web/data-access-auth';
import { SyncEngine } from '@lister/web/data-access-sync';
import { NOTICE_DURATION_MS, Notifier } from '@lister/web/util-notify';
import { ConfirmDialog, type ConfirmDialogData } from '@lister/web/ui';
import { PasswordForm } from '../password/password-form';

/** The signed-in user's profile: display name, password, and signing out. */
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
    PasswordForm,
    RouterLink,
  ],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.scss',
})
export class ProfilePage {
  private readonly session = inject(AuthSession);
  private readonly sync = inject(SyncEngine);
  private readonly dialog = inject(MatDialog);
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
  protected readonly signOutError = signal('');
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

  /** Warns when changes are still waiting to sync: signing out wipes this device's copy. */
  protected async signOut(): Promise<void> {
    this.signOutError.set('');
    const pending = this.sync.pendingCount();
    if (pending > 0) {
      const confirmed = await new Promise<boolean>((resolve) => {
        this.dialog
          .open<ConfirmDialog, ConfirmDialogData, true>(ConfirmDialog, {
            data: {
              heading: 'Sign out without syncing?',
              message: `${pending === 1 ? '1 change has' : `${pending} changes have`} not reached the server yet. Signing out deletes them from this device, and they are lost.`,
              confirm: 'Sign out anyway',
            },
          })
          .afterClosed()
          .subscribe((result) => resolve(result === true));
      });
      if (!confirmed) return;
    }
    try {
      await this.session.signOut();
    } catch (error) {
      this.signOutError.set(
        describeAuthError(error, 'Signing out failed. Try again.'),
      );
    }
  }
}
