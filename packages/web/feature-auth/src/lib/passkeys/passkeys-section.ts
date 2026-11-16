import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, inject, signal, viewChild } from '@angular/core';
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
import {
  MatError,
  MatFormField,
  MatHint,
  MatLabel,
} from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import {
  PASSKEY_NAME_MAX,
  type PasskeyInfo,
} from '@lister/shared/api-contracts';
import { Passkeys, describePasskeyError } from '@lister/web/data-access-auth';
import { NOTICE_DURATION_MS, Notifier } from '@lister/web/util-notify';
import { ConfirmDialog, type ConfirmDialogData } from '@lister/web/ui';
import { PasskeyWaiting } from '../passkey-waiting/passkey-waiting';

/** The user's passkeys on their profile: list, add (with a name) and remove. */
@Component({
  selector: 'lister-passkeys-section',
  imports: [
    DatePipe,
    FormField,
    MatButton,
    MatError,
    MatFormField,
    MatHint,
    MatIcon,
    MatInput,
    MatLabel,
    PasskeyWaiting,
  ],
  templateUrl: './passkeys-section.html',
  styleUrl: './passkeys-section.scss',
})
export class PasskeysSection {
  private readonly passkeys = inject(Passkeys);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(Notifier);

  protected readonly list = httpResource<PasskeyInfo[]>(
    () => this.passkeys.listUrl,
  );
  protected readonly supported = this.passkeys.supported();
  /** A passkey is being created: the authenticator has not answered yet (it can take a minute). */
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  private ceremony?: AbortController;
  private readonly nameInput = viewChild(MatInput);

  private readonly model = signal({ name: '' });
  protected readonly addForm = form(this.model, (path) => {
    required(path.name, { message: 'Give the passkey a name' });
    pattern(path.name, /\S/, { message: 'Give the passkey a name' });
    maxLength(path.name, PASSKEY_NAME_MAX, {
      message: 'That name is too long',
    });
  });

  protected add(event: Event): void {
    event.preventDefault();
    this.error.set('');
    void submit(this.addForm, async () => {
      const ceremony = new AbortController();
      this.ceremony = ceremony;
      this.busy.set(true);
      try {
        const added = await this.passkeys.add(
          this.model().name.trim(),
          ceremony.signal,
        );
        this.model.set({ name: '' });
        this.addForm().reset();
        this.list.reload();
        void this.notifier.notify({
          message: `Passkey “${added.name}” added`,
          duration: NOTICE_DURATION_MS,
        });
        this.focusName();
      } catch (error) {
        // Cancelled by the user: nothing to explain, and the name stays for another try.
        if (!ceremony.signal.aborted) {
          this.error.set(
            describePasskeyError(
              error,
              'The passkey was not added. Try again.',
            ),
          );
        }
      } finally {
        if (this.ceremony === ceremony) {
          this.ceremony = undefined;
          this.busy.set(false);
        }
      }
    });
  }

  /** Stops a passkey prompt nobody is answering, and gives the form back at once. */
  protected cancelAdd(): void {
    if (!this.ceremony) return;
    this.ceremony.abort();
    this.ceremony = undefined;
    this.busy.set(false);
    void this.passkeys.cancel();
  }

  /** The button that was used is gone or disabled, so focus goes to where the next action starts. */
  private focusName(): void {
    this.nameInput()?.focus();
  }

  protected async remove(passkey: PasskeyInfo): Promise<void> {
    this.error.set('');
    const confirmed = await new Promise<boolean>((resolve) => {
      this.dialog
        .open<ConfirmDialog, ConfirmDialogData, true>(ConfirmDialog, {
          data: {
            heading: 'Remove this passkey?',
            message: `“${passkey.name}” will no longer sign you in. You can also delete it from the device that holds it.`,
            confirm: 'Remove',
          },
        })
        .afterClosed()
        .subscribe((result) => resolve(result === true));
    });
    if (!confirmed) return;
    try {
      await this.passkeys.remove(passkey.id);
      this.list.reload();
      void this.notifier.notify({
        message: `Passkey “${passkey.name}” removed`,
        duration: NOTICE_DURATION_MS,
      });
      this.focusName();
    } catch (error) {
      this.error.set(
        describePasskeyError(error, 'The passkey was not removed. Try again.'),
      );
    }
  }
}
