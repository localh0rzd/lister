import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthSession } from '@lister/web/data-access-auth';
import { DISCARDED_CHANGES_KEY } from '@lister/web/data-access-local-db';
import { Notifier } from '@lister/web/util-notify';
import { RejectionNotices } from './rejection-notices';
import { SyncEngine, type SyncError } from './sync-engine';

function setup() {
  const errors = signal<readonly SyncError[]>([]);
  const signInRequired = signal(false);
  const navigateByUrl = vi.fn(() => Promise.resolve(true));
  const router = { navigateByUrl, url: '/lists' };
  const user = signal<{ id: string } | null>({ id: 'u1' });
  const engine = {
    errors,
    signInRequired,
    start: vi.fn(),
    dismissError: vi.fn(async (id: string) =>
      errors.update((list) => list.filter((e) => e.mutationId !== id)),
    ),
  };
  let close: ((outcome?: 'action' | 'dismissed') => void) | undefined;
  const notifier = {
    notify: vi.fn(
      () =>
        new Promise<'action' | 'dismissed'>((resolve) => {
          close = (outcome = 'dismissed') => resolve(outcome);
        }),
    ),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: SyncEngine, useValue: engine },
      { provide: Notifier, useValue: notifier },
      { provide: Router, useValue: router },
      { provide: AuthSession, useValue: { user } },
    ],
  });
  const notices = TestBed.inject(RejectionNotices);
  return {
    errors,
    signInRequired,
    navigateByUrl,
    router,
    user,
    engine,
    notifier,
    notices,
    close: (outcome?: 'action' | 'dismissed') => close?.(outcome),
  };
}

const rejection = (reason: string): SyncError => ({
  mutationId: crypto.randomUUID(),
  reason,
  at: 1,
});

describe('RejectionNotices', () => {
  it('starts the engine', () => {
    const { engine, notices } = setup();
    notices.start();
    notices.start();
    expect(engine.start).toHaveBeenCalledTimes(1);
  });

  describe('after signing in as somebody else', () => {
    afterEach(() => localStorage.removeItem(DISCARDED_CHANGES_KEY));

    it("says once that the previous user's unsynced changes were discarded", () => {
      localStorage.setItem(DISCARDED_CHANGES_KEY, '2');
      const { notifier, notices } = setup();

      notices.start();

      expect(notifier.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          message:
            '2 unsynced changes of the previous user on this device were discarded.',
        }),
      );
      expect(localStorage.getItem(DISCARDED_CHANGES_KEY)).toBeNull();
    });

    it('says nothing otherwise', () => {
      const { notifier, notices } = setup();
      notices.start();
      expect(notifier.notify).not.toHaveBeenCalled();
    });
  });

  describe('when the session has ended', () => {
    it('asks once to sign in, and goes to the sign-in page when the action is used', async () => {
      const { signInRequired, notifier, notices, close, navigateByUrl } =
        setup();
      notices.start();

      signInRequired.set(true);
      TestBed.tick();
      TestBed.tick();

      expect(notifier.notify).toHaveBeenCalledTimes(1);
      expect(notifier.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Sign in to sync your changes'),
          action: 'Sign in',
        }),
      );
      close('action');
      await vi.waitFor(() =>
        expect(navigateByUrl).toHaveBeenCalledWith('/sign-in'),
      );
    });

    it('does not ask somebody who is not signed in, who is being sent to sign-in anyway', () => {
      const { signInRequired, notifier, notices, user } = setup();
      user.set(null);
      notices.start();

      signInRequired.set(true);
      TestBed.tick();

      expect(notifier.notify).not.toHaveBeenCalled();
    });

    it('does not ask on the sign-in page, where the user is being asked anyway', () => {
      const { signInRequired, notifier, notices, router } = setup();
      router.url = '/sign-in?returnUrl=%2Flists';
      notices.start();

      signInRequired.set(true);
      TestBed.tick();

      expect(notifier.notify).not.toHaveBeenCalled();
    });

    it('does not navigate when the notice is dismissed, and asks again after the next refusal', () => {
      const { signInRequired, notifier, notices, close, navigateByUrl } =
        setup();
      notices.start();
      signInRequired.set(true);
      TestBed.tick();
      close('dismissed');
      signInRequired.set(false);
      TestBed.tick();
      signInRequired.set(true);
      TestBed.tick();

      expect(navigateByUrl).not.toHaveBeenCalled();
      expect(notifier.notify).toHaveBeenCalledTimes(2);
    });
  });

  it('shows each refused change once, with its reason, then dismisses it', async () => {
    const { errors, engine, notifier, notices, close } = setup();
    notices.start();
    const loop = rejection('That would make a loop: “A” already contains “B”');

    errors.set([loop]);
    TestBed.tick();
    errors.set([loop]); // the same rejection again (e.g. another tab's update)
    TestBed.tick();

    expect(notifier.notify).toHaveBeenCalledTimes(1);
    expect(notifier.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Change not saved: That would make a loop: “A” already contains “B”',
      }),
    );
    expect(engine.dismissError).not.toHaveBeenCalled();

    close();
    await vi.waitFor(() =>
      expect(engine.dismissError).toHaveBeenCalledWith(loop.mutationId),
    );
  });
});
