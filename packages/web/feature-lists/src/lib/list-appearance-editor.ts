import { Service, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import type { List } from '@lister/shared/domain';
import { SpaceChanges } from '@lister/web/data-access-sync';
import {
  ListAppearanceDialog,
  type ListAppearance,
  type ListAppearanceDialogData,
} from '@lister/web/ui';
import { firstValueFrom } from 'rxjs';

/** "Colour and icon" (D26): asks which, and sets only what changed (per-field, D5). */
@Service()
export class ListAppearanceEditor {
  private readonly dialog = inject(MatDialog);
  private readonly changes = inject(SpaceChanges);

  async edit(list: List): Promise<void> {
    const ref = this.dialog.open<
      ListAppearanceDialog,
      ListAppearanceDialogData,
      ListAppearance
    >(ListAppearanceDialog, {
      data: { title: list.title, colour: list.colour, icon: list.icon },
    });
    const choice = await firstValueFrom(ref.afterClosed());
    if (!choice) return;
    const patch = {
      ...(choice.colour !== list.colour && { colour: choice.colour }),
      ...(choice.icon !== list.icon && { icon: choice.icon }),
    };
    if (Object.keys(patch).length === 0) return;
    await this.changes.apply({
      name: 'list.update',
      args: { id: list.id, patch },
    });
  }
}
