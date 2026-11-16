import { DatePipe, DOCUMENT } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { Clipboard } from '@angular/cdk/clipboard';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import {
  type RegistrationToken,
  type RegistrationTokenList,
  apiPath,
  registrationLink,
} from '@lister/shared/api-contracts';
import { describeAuthError } from '@lister/web/data-access-auth';
import {
  ConfirmDialog,
  type ConfirmDialogData,
  LoadingHint,
} from '@lister/web/ui';
import { NOTICE_DURATION_MS, Notifier } from '@lister/web/util-notify';
import { RegistrationTokensApi } from '../registration-tokens-api';

/**
 * Registration links (D23): admins create one-time links that let someone register as a regular
 * user, copy them, and remove the ones that are still unused.
 */
@Component({
  selector: 'lister-registration-links',
  imports: [DatePipe, LoadingHint, MatButton, MatIcon, MatIconButton],
  templateUrl: './registration-links.html',
  styleUrl: './registration-links.scss',
})
export class RegistrationLinks {
  private readonly api = inject(RegistrationTokensApi);
  private readonly clipboard = inject(Clipboard);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(Notifier);
  private readonly origin = inject(DOCUMENT).location.origin;

  protected readonly list = httpResource<RegistrationTokenList>(() =>
    apiPath('registration-tokens'),
  );
  /** The link of each token: `PUBLIC_URL` when the server has one, otherwise this page's origin. */
  protected readonly links = computed(() => {
    const list = this.list.value();
    const base = list?.publicUrl ?? this.origin;
    return (list?.tokens ?? []).map((token) => ({
      ...token,
      link: registrationLink(base, token.token),
    }));
  });

  protected async create(): Promise<void> {
    try {
      await this.api.create();
      this.list.reload();
    } catch (error) {
      this.say(describeAuthError(error));
    }
  }

  protected copy(link: string): void {
    this.say(
      this.clipboard.copy(link)
        ? 'Link copied'
        : 'Could not copy the link. Select it and copy it by hand.',
    );
  }

  /** Asks first: a removed link can't come back, and whoever has it can no longer register. */
  protected remove(token: RegistrationToken): void {
    this.dialog
      .open<ConfirmDialog, ConfirmDialogData, true>(ConfirmDialog, {
        data: {
          heading: 'Remove this link?',
          message:
            'Whoever has it can no longer register with it. This cannot be undone.',
          confirm: 'Remove',
        },
      })
      .afterClosed()
      .subscribe(async (confirmed) => {
        if (!confirmed) return;
        try {
          await this.api.remove(token.token);
          this.list.reload();
          this.say('Link removed. It no longer works.');
        } catch (error) {
          this.say(describeAuthError(error));
        }
      });
  }

  private say(message: string): void {
    void this.notifier.notify({ message, duration: NOTICE_DURATION_MS });
  }
}
