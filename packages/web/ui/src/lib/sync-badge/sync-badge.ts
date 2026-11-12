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
    @if (text(); as label) {
      <span class="badge" [class.offline]="!online()">
        <mat-icon aria-hidden="true">{{
          online() ? 'sync' : 'cloud_off'
        }}</mat-icon>
        <span class="label">{{ label }}</span>
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

  protected readonly text = computed(() => {
    const pending = this.pendingCount();
    const changes = pending === 1 ? '1 change' : `${pending} changes`;
    if (!this.online()) {
      if (this.compact()) return pending > 0 ? String(pending) : 'Offline';
      return pending > 0 ? `Offline · ${changes} not synced` : 'Offline';
    }
    if (pending === 0) return '';
    return this.compact() ? String(pending) : `${changes} not synced`;
  });
}
