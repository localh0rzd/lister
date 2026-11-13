import { Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';

export interface ConfirmDialogData {
  heading: string;
  message: string;
  /** The button that goes ahead, e.g. "Delete" or "Sign out". */
  confirm: string;
}

/**
 * Asks before something that can't be undone with a snackbar (deleting an account, signing out
 * with unsynced changes). It closes with `true` when confirmed, and with `undefined` otherwise.
 */
@Component({
  selector: 'lister-confirm-dialog',
  imports: [
    MatButton,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
  ],
  templateUrl: './confirm-dialog.html',
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
}
