import { Component, computed, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import { type CurrentUser, apiPath } from '@lister/shared/api-contracts';
import { AuthSession, describeAuthError } from '@lister/web/data-access-auth';
import {
  ConfirmDialog,
  type ConfirmDialogData,
  LoadingHint,
} from '@lister/web/ui';
import { NOTICE_DURATION_MS, Notifier } from '@lister/web/util-notify';
import {
  ResetPasswordDialog,
  type ResetPasswordDialogData,
} from '../reset-password-dialog/reset-password-dialog';
import { RegistrationLinks } from '../registration-links/registration-links';
import { UserDialog, type UserDialogData } from '../user-dialog/user-dialog';
import { UsersApi } from '../users-api';

/** User administration (admins only): the accounts, with create, edit, reset password, admin and delete. */
@Component({
  selector: 'lister-users-page',
  imports: [
    LoadingHint,
    MatButton,
    MatIcon,
    MatIconButton,
    MatMenu,
    MatMenuItem,
    MatMenuTrigger,
    RegistrationLinks,
    RouterLink,
  ],
  templateUrl: './users-page.html',
  styleUrl: './users-page.scss',
})
export class UsersPage {
  private readonly api = inject(UsersApi);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(Notifier);
  private readonly session = inject(AuthSession);

  protected readonly users = httpResource<CurrentUser[]>(() =>
    apiPath('users'),
  );
  protected readonly myId = computed(() => this.session.user()?.id);

  protected add(): void {
    this.dialog
      .open<UserDialog, UserDialogData, CurrentUser>(UserDialog, { data: {} })
      .afterClosed()
      .subscribe((created) => {
        if (!created) return;
        this.users.reload();
        this.say(`Added ${created.displayName}`);
      });
  }

  protected edit(user: CurrentUser): void {
    this.dialog
      .open<UserDialog, UserDialogData, CurrentUser>(UserDialog, {
        data: { user },
      })
      .afterClosed()
      .subscribe((saved) => {
        if (!saved) return;
        this.users.reload();
        // Editing yourself changes who the app says is signed in.
        if (saved.id === this.myId()) void this.session.refresh();
        this.say(`Saved ${saved.displayName}`);
      });
  }

  protected resetPassword(user: CurrentUser): void {
    this.dialog
      .open<ResetPasswordDialog, ResetPasswordDialogData, true>(
        ResetPasswordDialog,
        { data: { user } },
      )
      .afterClosed()
      .subscribe((done) => {
        if (done)
          this.say(
            `${user.displayName} must choose a new password at the next sign-in`,
          );
      });
  }

  protected async setAdmin(user: CurrentUser, isAdmin: boolean): Promise<void> {
    try {
      await this.api.update(user.id, { isAdmin });
      this.users.reload();
      this.say(
        isAdmin
          ? `${user.displayName} is now an admin`
          : `${user.displayName} is no longer an admin`,
      );
    } catch (error) {
      this.say(describeAuthError(error));
    }
  }

  protected remove(user: CurrentUser): void {
    this.dialog
      .open<ConfirmDialog, ConfirmDialogData, true>(ConfirmDialog, {
        data: {
          heading: `Delete ${user.displayName}?`,
          message:
            'Their account, their personal space and everything in it are deleted for good. Shared spaces keep their content.',
          confirm: 'Delete',
        },
      })
      .afterClosed()
      .subscribe(async (confirmed) => {
        if (!confirmed) return;
        try {
          await this.api.remove(user.id);
          this.users.reload();
          this.say(`Deleted ${user.displayName}`);
        } catch (error) {
          this.say(describeAuthError(error));
        }
      });
  }

  private say(message: string): void {
    void this.notifier.notify({ message, duration: NOTICE_DURATION_MS });
  }
}
