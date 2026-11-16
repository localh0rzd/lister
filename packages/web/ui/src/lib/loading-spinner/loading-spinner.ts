import { Component, DestroyRef, inject, input, signal } from '@angular/core';
import { MatProgressSpinner } from '@angular/material/progress-spinner';

/** How long a load may take before the spinner appears. */
export const LOADING_SPINNER_DELAY_MS = 300;

/**
 * An indeterminate Material spinner for a section that is loading. The element itself is the
 * box that keeps the section's place (give it a height from outside); the spinner only appears
 * after `LOADING_SPINNER_DELAY_MS`, so a fast load shows no flash.
 */
@Component({
  selector: 'lister-loading-spinner',
  imports: [MatProgressSpinner],
  templateUrl: './loading-spinner.html',
  styleUrl: './loading-spinner.scss',
})
export class LoadingSpinner {
  /** What is loading, read out by screen readers, e.g. "Loading spaces". */
  readonly label = input.required<string>();
  protected readonly shown = signal(false);

  constructor() {
    const timer = setTimeout(
      () => this.shown.set(true),
      LOADING_SPINNER_DELAY_MS,
    );
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
  }
}
