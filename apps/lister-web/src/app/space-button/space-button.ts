import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { CurrentSpace, valueOf } from '@lister/web/data-access-local-db';
import { TruncatedTooltip } from '@lister/web/ui';

/**
 * The current space's name in the app bar (D29), shown on every page. A button that opens a menu
 * to switch space or go to the Space page. Reads the device's copy, so it works offline.
 */
@Component({
  selector: 'lister-space-button',
  imports: [
    MatButton,
    MatIcon,
    MatMenu,
    MatMenuItem,
    MatMenuTrigger,
    RouterLink,
    TruncatedTooltip,
  ],
  templateUrl: './space-button.html',
  styleUrl: './space-button.scss',
})
export class SpaceButton {
  private readonly current = inject(CurrentSpace);
  protected readonly spaces = computed(() => valueOf(this.current.all()) ?? []);
  protected readonly space = computed(() => valueOf(this.current.state()));
  protected readonly currentId = this.current.id;

  protected select(id: string): void {
    this.current.select(id);
  }
}
