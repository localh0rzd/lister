import { DOCUMENT } from '@angular/common';
import { Service, inject } from '@angular/core';

/**
 * Loads a page from scratch, which drops everything the app holds in memory. Signing in as
 * somebody else and signing out do this, so no state of the previous user survives. Tests
 * replace it.
 */
@Service()
export class PageNavigator {
  private readonly location = inject(DOCUMENT).defaultView?.location;

  load(url: string): void {
    this.location?.assign(url);
  }
}
