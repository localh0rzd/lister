import { Component, computed, inject } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TRASH_KEEP_DAYS } from '@lister/shared/domain';
import { CurrentSpace } from '@lister/web/data-access-local-db';
import { SpacesSection } from './spaces/spaces-section';

/** The Space destination: the space switcher, spaces and members, and the trash. */
@Component({
  selector: 'lister-space-page',
  imports: [MatIcon, RouterLink, SpacesSection],
  templateUrl: './space-page.html',
  styleUrl: './space-page.scss',
})
export class SpacePage {
  private readonly current = inject(CurrentSpace);
  protected readonly keepDays = TRASH_KEEP_DAYS;
  /**
   * The sections below the spaces wait for the device's spaces, which set how tall the Spaces
   * section is, so they appear in their place instead of being pushed down a frame later.
   */
  protected readonly spacesKnown = computed(
    () => this.current.all().status !== 'loading',
  );
}
