import { Component, effect, input, signal } from '@angular/core';

/** How long a passkey prompt may take before the page explains that it is still waiting. */
export const PASSKEY_WAITING_DELAY_MS = 1000;

/**
 * "Waiting for your passkey…", next to the Cancel of a passkey ceremony. A password manager
 * extension may hold its answer back for the whole ceremony timeout after its window was closed,
 * and the page can't tell, so the user is told how to get out (T-042).
 *
 * The host is a polite live region that is always there, so screen readers announce the text when
 * it shows. The text takes its place as soon as the ceremony starts, but stays invisible for
 * `PASSKEY_WAITING_DELAY_MS`: a ceremony that answers at once shows nothing, and showing it later
 * moves nothing.
 */
@Component({
  selector: 'lister-passkey-waiting',
  templateUrl: './passkey-waiting.html',
  styleUrl: './passkey-waiting.scss',
  host: { role: 'status' },
})
export class PasskeyWaiting {
  /** A ceremony is waiting for the authenticator. */
  readonly waiting = input(false);
  protected readonly shown = signal(false);

  constructor() {
    effect((onCleanup) => {
      if (!this.waiting()) {
        this.shown.set(false);
        return;
      }
      const timer = setTimeout(
        () => this.shown.set(true),
        PASSKEY_WAITING_DELAY_MS,
      );
      onCleanup(() => clearTimeout(timer));
    });
  }
}
