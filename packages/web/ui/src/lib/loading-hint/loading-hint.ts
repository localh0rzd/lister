import { Component, DestroyRef, inject, signal } from '@angular/core';

/** How long a load may take before "Loading…" appears. */
export const LOADING_HINT_DELAY_MS = 300;

/**
 * "Loading…", shown only when loading takes longer than `LOADING_HINT_DELAY_MS`: local data
 * usually arrives within a few milliseconds, and a hint that flashes for one frame is noise.
 */
@Component({
  selector: 'lister-loading-hint',
  template: `
    @if (shown()) {
      <p class="hint">Loading…</p>
    }
  `,
  styles: `
    .hint {
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class LoadingHint {
  protected readonly shown = signal(false);

  constructor() {
    const timer = setTimeout(() => this.shown.set(true), LOADING_HINT_DELAY_MS);
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
  }
}
