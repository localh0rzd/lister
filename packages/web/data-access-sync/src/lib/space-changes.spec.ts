import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CurrentSpace } from '@lister/web/data-access-local-db';
import { Notifier } from '@lister/web/util-notify';
import { SpaceChanges } from './space-changes';
import { SyncEngine } from './sync-engine';

function setup(spaceId: string | undefined, result = { ok: true } as const) {
  const mutate = vi.fn(async () => result as { ok: boolean; reason?: string });
  const notify = vi.fn(async () => 'dismissed' as const);
  TestBed.configureTestingModule({
    providers: [
      { provide: SyncEngine, useValue: { mutate } },
      { provide: Notifier, useValue: { notify } },
      { provide: CurrentSpace, useValue: { id: signal(spaceId) } },
    ],
  });
  return { changes: TestBed.inject(SpaceChanges), mutate, notify };
}

describe('SpaceChanges', () => {
  it('adds the current space to a change', async () => {
    const { changes, mutate } = setup('space-1');
    expect(
      await changes.apply({ name: 'list.restore', args: { id: 'l1' } }),
    ).toBe(true);
    expect(mutate).toHaveBeenCalledWith({
      spaceId: 'space-1',
      name: 'list.restore',
      args: { id: 'l1' },
    });
  });

  it('says why a change was refused', async () => {
    const { changes, mutate, notify } = setup('space-1');
    mutate.mockResolvedValueOnce({ ok: false, reason: 'Nope' });
    expect(
      await changes.apply({ name: 'list.restore', args: { id: 'l1' } }),
    ).toBe(false);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Nope' }),
    );
  });

  it('refuses while there is no space yet', async () => {
    const { changes, mutate, notify } = setup(undefined);
    expect(
      await changes.apply({ name: 'list.restore', args: { id: 'l1' } }),
    ).toBe(false);
    expect(mutate).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Not connected yet: try again in a moment',
      }),
    );
  });

  it('applies the undo change when Undo is tapped', async () => {
    const { changes, mutate, notify } = setup('space-1');
    notify.mockResolvedValueOnce('action' as never);
    await changes.withUndo(
      { name: 'item.delete', args: { id: 'i1' } },
      'Deleted “Tent”',
      { name: 'item.restore', args: { id: 'i1' } },
    );
    expect(mutate.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
      expect.objectContaining({ name: 'item.delete' }),
      expect.objectContaining({ name: 'item.restore' }),
    ]);
  });
});
