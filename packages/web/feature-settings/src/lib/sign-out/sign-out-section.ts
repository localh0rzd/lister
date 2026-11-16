import { Component, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { AuthSession, describeAuthError } from '@lister/web/data-access-auth';
import { SyncEngine } from '@lister/web/data-access-sync';
import { ConfirmDialog, type ConfirmDialogData } from '@lister/web/ui';

/** "Sign out" at the bottom of Settings; warns first when changes are still waiting to sync. */
@Component({
  selector: 'lister-sign-out-section',
  imports: [MatButton],
  templateUrl: './sign-out-section.html',
  styleUrl: './sign-out-section.scss',
})
export class SignOutSection {
  private readonly session = inject(AuthSession);
  private readonly sync = inject(SyncEngine);
  private readonly dialog = inject(MatDialog);

  protected readonly error = signal('');

  /** Signing out wipes this device's copy, so unsynced changes need a confirmation. */
  protected async signOut(): Promise<void> {
    this.error.set('');
    const pending = this.sync.pendingCount();
    if (pending > 0) {
      const result = await firstValueFrom(
        this.dialog
          .open<ConfirmDialog, ConfirmDialogData, true>(ConfirmDialog, {
            data: {
              heading: 'Sign out without syncing?',
              message:
                pending === 1
                  ? '1 change has not reached the server yet. Signing out deletes it from this device, and it is lost.'
                  : `${pending} changes have not reached the server yet. Signing out deletes them from this device, and they are lost.`,
              confirm: 'Sign out anyway',
            },
          })
          .afterClosed(),
      );
      if (result !== true) return;
    }
    try {
      await this.session.signOut();
    } catch (error) {
      this.error.set(
        describeAuthError(error, 'Signing out failed. Try again.'),
      );
    }
  }
}
