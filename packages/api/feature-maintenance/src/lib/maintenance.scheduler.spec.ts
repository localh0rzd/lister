import { MaintenanceScheduler } from './maintenance.scheduler';

const at = (hour: number) => Date.UTC(2026, 10, 16, hour);

function setup(due = true, memory = false) {
  const backups = { isDue: vi.fn(() => due), backup: vi.fn(() => '/b/x.db') };
  const purges = {
    isDue: vi.fn(() => due),
    purge: vi.fn(() => 2),
    markDone: vi.fn(),
  };
  const scheduler = new MaintenanceScheduler(
    { sqlite: { memory } } as never,
    backups as never,
    purges as never,
  );
  return { scheduler, backups, purges };
}

describe('MaintenanceScheduler', () => {
  it('backs up before it purges, and marks the purge done', () => {
    const { scheduler, backups, purges } = setup();
    const order: string[] = [];
    backups.backup.mockImplementation(() => (order.push('backup'), 'x'));
    purges.purge.mockImplementation(() => (order.push('purge'), 0));

    scheduler.runDue(at(4));

    expect(order).toEqual(['backup', 'purge']);
    expect(purges.markDone).toHaveBeenCalledWith(at(4));
  });

  it('waits for the maintenance hour', () => {
    const { scheduler, backups, purges } = setup();
    scheduler.runDue(at(2));
    expect(backups.backup).not.toHaveBeenCalled();
    expect(purges.purge).not.toHaveBeenCalled();
  });

  it('does nothing when neither is due', () => {
    const { scheduler, backups, purges } = setup(false);
    scheduler.runDue(at(4));
    expect(backups.backup).not.toHaveBeenCalled();
    expect(purges.purge).not.toHaveBeenCalled();
  });

  it('still purges when the backup fails, and does not mark a failed purge done', () => {
    const { scheduler, backups, purges } = setup();
    backups.backup.mockImplementation(() => {
      throw new Error('disk full');
    });
    scheduler.runDue(at(4));
    expect(purges.purge).toHaveBeenCalled();

    purges.purge.mockImplementation(() => {
      throw new Error('locked');
    });
    purges.markDone.mockClear();
    expect(() => scheduler.runDue(at(4))).not.toThrow();
    expect(purges.markDone).not.toHaveBeenCalled();
  });

  it('survives a database error while checking what is due', () => {
    const { scheduler, purges } = setup();
    purges.isDue.mockImplementation(() => {
      throw new Error('disk I/O error');
    });
    expect(() => scheduler.runDue(at(4))).not.toThrow();
  });

  describe('timers', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('schedules nothing for an in-memory database', () => {
      const { scheduler } = setup(true, true);
      scheduler.onApplicationBootstrap();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('schedules the start-up and the periodic check, and shutdown clears both', () => {
      const { scheduler } = setup();
      scheduler.onApplicationBootstrap();
      expect(vi.getTimerCount()).toBe(2);
      scheduler.onApplicationShutdown();
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
