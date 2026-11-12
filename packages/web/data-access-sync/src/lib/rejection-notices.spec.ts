import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Notifier } from '@lister/web/util-notify';
import { RejectionNotices } from './rejection-notices';
import { SyncEngine, type SyncError } from './sync-engine';

function setup() {
  const errors = signal<readonly SyncError[]>([]);
  const engine = {
    errors,
    start: vi.fn(),
    dismissError: vi.fn(async (id: string) =>
      errors.update((list) => list.filter((e) => e.mutationId !== id)),
    ),
  };
  let close: (() => void) | undefined;
  const notifier = {
    notify: vi.fn(
      () =>
        new Promise<'dismissed'>((resolve) => {
          close = () => resolve('dismissed');
        }),
    ),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: SyncEngine, useValue: engine },
      { provide: Notifier, useValue: notifier },
    ],
  });
  const notices = TestBed.inject(RejectionNotices);
  return { errors, engine, notifier, notices, close: () => close?.() };
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
