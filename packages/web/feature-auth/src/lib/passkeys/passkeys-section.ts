import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
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
  protected readonly busy = signal(false);
  protected readonly error = signal('');

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
      this.busy.set(true);
      try {
        const added = await this.passkeys.add(this.model().name.trim());
        this.model.set({ name: '' });
        this.addForm().reset();
        this.list.reload();
        void this.notifier.notify({
          message: `Passkey “${added.name}” added`,
          duration: NOTICE_DURATION_MS,
        });
      } catch (error) {
        this.error.set(
          describePasskeyError(error, 'The passkey was not added. Try again.'),
        );
      } finally {
        this.busy.set(false);
      }
    });
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
    } catch (error) {
      this.error.set(
        describePasskeyError(error, 'The passkey was not removed. Try again.'),
      );
    }
  }
}
