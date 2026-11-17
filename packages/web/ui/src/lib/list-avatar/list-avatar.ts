import { Component, computed, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import type { ListColour, ListIconName } from '@lister/shared/domain';

/**
 * A list's round mark (D26): its icon on its colour, or the first letter of its title on the
 * theme's tone when it has none. Decorative (`aria-hidden`): the title is always beside it.
 * Its size is `--lister-avatar-size` (40px by default).
 */
@Component({
  selector: 'lister-list-avatar',
  imports: [MatIcon],
  templateUrl: './list-avatar.html',
  styleUrl: './list-avatar.scss',
  host: { 'aria-hidden': 'true', '[attr.data-colour]': 'colour()' },
})
export class ListAvatar {
  readonly title = input('');
  readonly colour = input<ListColour | null>(null);
  readonly icon = input<ListIconName | null>(null);

  protected readonly initial = computed(
    () => [...this.title().trim()][0]?.toLocaleUpperCase() ?? '',
  );
}
