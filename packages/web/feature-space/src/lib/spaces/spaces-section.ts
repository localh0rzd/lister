import { Component, computed, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import {
  type SpaceMember,
  type SpaceSummary,
  SPACE_LIMITS,
  apiPath,
} from '@lister/shared/api-contracts';
import { AuthSession, describeAuthError } from '@lister/web/data-access-auth';
import { CurrentSpace, valueOf } from '@lister/web/data-access-local-db';
import { ConfirmDialog, type ConfirmDialogData } from '@lister/web/ui';
import { NOTICE_DURATION_MS, Notifier } from '@lister/web/util-notify';
import {
  FieldDialog,
  type FieldDialogData,
} from '../field-dialog/field-dialog';
import { SpacesApi } from './spaces-api';

/** Space switcher, and creating, renaming and leaving spaces and managing their members (D14). */
@Component({
  selector: 'lister-spaces-section',
  imports: [MatButton, MatIcon],
  templateUrl: './spaces-section.html',
  styleUrl: './spaces-section.scss',
})
export class SpacesSection {
  private readonly api = inject(SpacesApi);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(Notifier);
  private readonly session = inject(AuthSession);
  private readonly current = inject(CurrentSpace);

  /** The switcher reads the device's copy, so it works offline. */
  protected readonly spaces = computed(() => valueOf(this.current.all()) ?? []);
  protected readonly currentId = this.current.id;
  /** Roles and members come from the server; managing a space needs a connection. */
  protected readonly summaries = httpResource<SpaceSummary[]>(() =>
    apiPath('spaces'),
  );
  protected readonly selected = computed(() =>
    this.summaries.hasValue()
      ? this.summaries.value().find((s) => s.id === this.currentId())
      : undefined,
  );
  protected readonly isOwner = computed(
    () => this.selected()?.role === 'owner',
  );
  protected readonly myId = computed(() => this.session.user()?.id);

  protected select(id: string): void {
    this.current.select(id);
  }

  protected create(): void {
    this.openField(
      {
        heading: 'New space',
        label: 'Name',
        confirm: 'Create',
        maxLength: SPACE_LIMITS.nameMax,
        hint: 'A shared space; add its members afterwards',
        submit: async (name) => {
          const created = await this.api.create({ name });
          this.current.select(created.id);
        },
      },
      'Space created',
    );
  }

  protected rename(space: SpaceSummary): void {
    this.openField(
      {
        heading: 'Rename space',
        label: 'Name',
        confirm: 'Rename',
        maxLength: SPACE_LIMITS.nameMax,
        value: space.name,
        submit: async (name) =>
          void (await this.api.rename(space.id, { name })),
      },
      'Space renamed',
    );
  }

  protected addMember(space: SpaceSummary): void {
    this.openField(
      {
        heading: 'Add a member',
        label: 'Username',
        confirm: 'Add',
        maxLength: 64,
        hint: 'They can then edit everything in this space',
        submit: async (username) =>
          void (await this.api.addMember(space.id, { username })),
      },
      'Member added',
    );
  }

  protected removeMember(space: SpaceSummary, member: SpaceMember): void {
    this.confirm(
      {
        heading: `Remove ${member.displayName}?`,
        message: `${member.displayName} loses access to “${space.name}”. Its lists and runs stay.`,
        confirm: 'Remove',
      },
      () => this.api.removeMember(space.id, member.userId),
      `${member.displayName} removed`,
    );
  }

  protected leave(space: SpaceSummary): void {
    this.confirm(
      {
        heading: `Leave “${space.name}”?`,
        message:
          'You lose access to its lists and runs, and they are removed from this device. Changes to it that have not synced yet are lost. Someone has to add you again to get back in.',
        confirm: 'Leave',
      },
      () => this.api.leave(space.id),
      'You left the space',
    );
  }

  protected remove(space: SpaceSummary): void {
    this.confirm(
      {
        heading: `Delete “${space.name}”?`,
        message:
          'Its lists and runs are deleted for good, for every member. Changes to it that have not synced yet are lost.',
        confirm: 'Delete',
      },
      () => this.api.remove(space.id),
      'Space deleted',
    );
  }

  private openField(data: FieldDialogData, done: string): void {
    this.dialog
      .open<FieldDialog, FieldDialogData, true>(FieldDialog, { data })
      .afterClosed()
      .subscribe((saved) => {
        if (!saved) return;
        this.summaries.reload();
        this.say(done);
      });
  }

  private confirm(
    data: ConfirmDialogData,
    action: () => Promise<void>,
    done: string,
  ): void {
    this.dialog
      .open<ConfirmDialog, ConfirmDialogData, true>(ConfirmDialog, { data })
      .afterClosed()
      .subscribe(async (confirmed) => {
        if (!confirmed) return;
        try {
          await action();
          this.summaries.reload();
          this.say(done);
        } catch (error) {
          this.say(describeAuthError(error));
        }
      });
  }

  private say(message: string): void {
    void this.notifier.notify({ message, duration: NOTICE_DURATION_MS });
  }
}
