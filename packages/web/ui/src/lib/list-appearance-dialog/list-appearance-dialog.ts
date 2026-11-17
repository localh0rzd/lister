import { Component, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import {
  LIST_COLOURS,
  LIST_ICONS,
  type ListColour,
  type ListIconName,
} from '@lister/shared/domain';
import { ListAvatar } from '../list-avatar/list-avatar';

export interface ListAppearance {
  colour: ListColour | null;
  icon: ListIconName | null;
}

export interface ListAppearanceDialogData extends ListAppearance {
  /** The list's title, shown in the preview when it has no icon. */
  title: string;
}

/**
 * Picks a list's colour and icon (D26), each optional. It closes with the choice, or
 * `undefined` when cancelled. Every option is a toggle button; choosing the selected one again
 * clears it. Each group is one tab stop (the selected option, else the first; then the last one
 * focused), and the arrow keys, Home and End move inside it.
 */
@Component({
  selector: 'lister-list-appearance-dialog',
  imports: [
    ListAvatar,
    MatButton,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
  ],
  templateUrl: './list-appearance-dialog.html',
  styleUrl: './list-appearance-dialog.scss',
})
export class ListAppearanceDialog {
  protected readonly data = inject<ListAppearanceDialogData>(MAT_DIALOG_DATA);
  private readonly dialog =
    inject<MatDialogRef<ListAppearanceDialog, ListAppearance>>(MatDialogRef);

  protected readonly colours = LIST_COLOURS;
  protected readonly icons = LIST_ICONS;
  protected readonly colour = signal(this.data.colour);
  protected readonly icon = signal(this.data.icon);
  /** The option of each group that Tab reaches. */
  protected readonly colourStop = signal<ListColour>(
    this.data.colour ?? LIST_COLOURS[0],
  );
  protected readonly iconStop = signal<ListIconName>(
    this.data.icon ?? LIST_ICONS[0].icon,
  );

  protected pickColour(colour: ListColour): void {
    this.colour.update((current) => (current === colour ? null : colour));
  }

  protected pickIcon(icon: ListIconName): void {
    this.icon.update((current) => (current === icon ? null : icon));
  }

  /** Arrow keys, Home and End inside a group (they wrap around at the ends). */
  protected moveFocus(event: KeyboardEvent): void {
    const group = event.currentTarget as HTMLElement;
    const buttons = [...group.querySelectorAll('button')];
    const from = buttons.indexOf(event.target as HTMLButtonElement);
    if (from < 0) return;
    const moves: Partial<Record<string, number>> = {
      ArrowRight: from + 1,
      ArrowDown: from + 1,
      ArrowLeft: from - 1,
      ArrowUp: from - 1,
      Home: 0,
      End: buttons.length - 1,
    };
    const to = moves[event.key];
    if (to === undefined) return;
    event.preventDefault();
    buttons[(to + buttons.length) % buttons.length].focus();
  }

  protected save(): void {
    this.dialog.close({ colour: this.colour(), icon: this.icon() });
  }
}
