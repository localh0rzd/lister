import { Component, computed, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

/**
 * A small sync indicator for the app bar and rail: nothing while everything is synced,
 * otherwise "Offline" and/or "N changes not synced".
 */
@Component({
  selector: 'lister-sync-badge',
  imports: [MatIcon],
  host: { role: 'status', 'aria-live': 'polite' },
  template: `
    @if (description(); as full) {
      <span class="badge" [class.offline]="!online()" [attr.title]="full">
        <mat-icon aria-hidden="true">{{
          online() ? 'sync' : 'cloud_off'
        }}</mat-icon>
        <!-- The short label is for the eye; screen readers get the whole sentence. -->
        <span class="label" aria-hidden="true">{{ label() }}</span>
        <span class="cdk-visually-hidden">{{ full }}</span>
      </span>
    }
  `,
  styles: `
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: var(--mat-sys-corner-full);
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
      font: var(--mat-sys-label-medium);
    }
    .badge.offline {
      background: var(--mat-sys-surface-container-highest);
      color: var(--mat-sys-on-surface);
    }
    mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
  `,
})
export class SyncBadge {
  readonly online = input.required<boolean>();
  readonly pendingCount = input.required<number>();
  /** Narrow places (the rail) show only the offline state and the count. */
  readonly compact = input(false);

  /** The whole sentence: "Offline", "Offline · 2 changes not synced", "1 change not synced". */
  protected readonly description = computed(() => {
    const pending = this.pendingCount();
    const changes = pending === 1 ? '1 change' : `${pending} changes`;
    if (!this.online())
      return pending > 0 ? `Offline · ${changes} not synced` : 'Offline';
    return pending > 0 ? `${changes} not synced` : '';
  });

  /** What fits: the whole sentence, or in compact mode just "Offline" or the count. */
  protected readonly label = computed(() => {
    if (!this.compact()) return this.description();
    const pending = this.pendingCount();
    return pending > 0 ? String(pending) : 'Offline';
  });
}
