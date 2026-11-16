import { Component } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TRASH_KEEP_DAYS } from '@lister/shared/domain';
import { SpacesSection } from './spaces/spaces-section';

/** The Space destination: the space switcher, spaces and members, and the trash. */
@Component({
  selector: 'lister-space-page',
  imports: [MatIcon, RouterLink, SpacesSection],
  templateUrl: './space-page.html',
  styleUrl: './space-page.scss',
})
export class SpacePage {
  protected readonly keepDays = TRASH_KEEP_DAYS;
}
