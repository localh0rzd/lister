import { Component, computed, inject } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TRASH_KEEP_DAYS } from '@lister/shared/domain';
import { CurrentSpace, Repositories } from '@lister/web/data-access-local-db';
import { SpaceChanges } from '@lister/web/data-access-sync';
import { Transfers } from '@lister/web/feature-transfer';
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
  private readonly repositories = inject(Repositories);
  private readonly transfers = inject(Transfers);
  private readonly changes = inject(SpaceChanges);
  private readonly lists = this.repositories.listsOfSpace(this.current.id);
  private readonly composition = this.repositories.compositionOfSpace(
    this.current.id,
  );
  protected readonly keepDays = TRASH_KEEP_DAYS;
  /**
   * The sections below the spaces wait for the device's spaces, which set how tall the Spaces
   * section is, so they appear in their place instead of being pushed down a frame later.
   */
  protected readonly spacesKnown = computed(
    () => this.current.all().status !== 'loading',
  );

  /** "Export all lists (JSON)": every live list of the space, built from the local rows. */
  protected exportAll(): void {
    const lists = this.lists();
    const composition = this.composition();
    if (lists.status !== 'ready' || composition.status !== 'ready') {
      this.changes.tell("Can't export right now: try again in a moment");
      return;
    }
    this.transfers.exportAll(lists.value, composition.value);
  }
}
