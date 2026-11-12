import { Component, computed, effect, input, signal } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

/** Online, changes usually sync within milliseconds: only changes waiting longer are shown. */
export const PENDING_GRACE_MS = 1000;

/**
 * A small sync indicator for the app bar and rail: nothing while everything is synced,
 * otherwise "Offline" and/or "N changes not synced". Online, pending changes show only once
 * they have waited for `PENDING_GRACE_MS`, so a quick sync doesn't make the badge flash.
 */
@Component({
  selector: 'lister-sync-badge',
  imports: [MatIcon],
  host: { role: 'status', 'aria-live': 'polite' },
  templateUrl: './sync-badge.html',
  styleUrl: './sync-badge.scss',
})
export class SyncBadge {
  readonly online = input.required<boolean>();
  readonly pendingCount = input.required<number>();
  /** Narrow places (the rail) show only the offline state and the count. */
  readonly compact = input(false);

  /** Pending changes have been waiting longer than the grace period (or we're offline). */
  private readonly overdue = signal(false);

  constructor() {
    effect((onCleanup) => {
      const waiting = this.pendingCount() > 0;
      if (!waiting) {
        this.overdue.set(false);
        return;
      }
      if (!this.online() || this.overdue()) {
        this.overdue.set(true);
        return;
      }
      const timer = setTimeout(() => this.overdue.set(true), PENDING_GRACE_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  private readonly shownPending = computed(() =>
    this.overdue() ? this.pendingCount() : 0,
  );

  /** The whole sentence: "Offline", "Offline · 2 changes not synced", "1 change not synced". */
  protected readonly description = computed(() => {
    const pending = this.online() ? this.shownPending() : this.pendingCount();
    const changes = pending === 1 ? '1 change' : `${pending} changes`;
    if (!this.online())
      return pending > 0 ? `Offline · ${changes} not synced` : 'Offline';
    return pending > 0 ? `${changes} not synced` : '';
  });

  /** What fits: the whole sentence, or in compact mode just "Offline" or the count. */
  protected readonly label = computed(() => {
    if (!this.compact()) return this.description();
    const pending = this.online() ? this.shownPending() : this.pendingCount();
    return pending > 0 ? String(pending) : 'Offline';
  });
}
