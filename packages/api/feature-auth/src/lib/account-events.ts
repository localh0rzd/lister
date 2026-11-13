import { Injectable } from '@nestjs/common';

/**
 * A change to accounts that long-lived connections (the sync socket) must act on at once:
 *
 * - `sessionsEnded`: some or all of the user's sessions ended (sign-out, password change or
 *   reset, deleted account). Connections whose session is gone must end.
 * - `membersChanged`: the member lists of these users' spaces changed (an account was deleted,
 *   or a display name changed), so their connected clients need a fresh welcome.
 */
export type AccountEvent =
  | { kind: 'sessionsEnded'; userId: string }
  | { kind: 'membersChanged'; userIds: readonly string[] };

export type AccountListener = (event: AccountEvent) => void;

/**
 * Announces account changes to whoever listens (`SyncGateway`). It lets features that depend on
 * this one react without this one depending on them. Listeners run synchronously.
 */
@Injectable()
export class AccountEvents {
  private readonly listeners = new Set<AccountListener>();

  /** Returns the function that unsubscribes again. */
  subscribe(listener: AccountListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: AccountEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
