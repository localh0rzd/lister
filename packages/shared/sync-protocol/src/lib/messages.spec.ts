import { newId } from '@lister/shared/domain';
import { PROTOCOL_VERSION } from './common';
import {
  MAX_PUSH_MUTATIONS,
  ackSchema,
  helloSchema,
  pokeSchema,
  pullSchema,
  pushSchema,
  rejectSchema,
  rowsSchema,
  updateRequiredSchema,
  welcomeSchema,
} from './messages';

const syncMetadata = () => ({
  id: newId(),
  spaceId: newId(),
  version: 3,
  deletedAt: null,
  createdBy: newId(),
  updatedBy: newId(),
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
});

const list = () => ({ ...syncMetadata(), title: 'Camping', description: '' });

const item = (listId: string) => ({
  ...syncMetadata(),
  listId,
  title: 'Tent',
  quantity: '',
  note: '',
  position: 'a0',
});

const deleteMutation = () => ({
  mutationId: newId(),
  spaceId: newId(),
  name: 'item.delete',
  args: { id: newId() },
});

describe('socket messages', () => {
  it('has a positive protocol version', () => {
    expect(PROTOCOL_VERSION).toBeGreaterThan(0);
    expect(
      helloSchema.safeParse({
        protocolVersion: PROTOCOL_VERSION,
        clientId: newId(),
      }).success,
    ).toBe(true);
    expect(
      updateRequiredSchema.safeParse({ protocolVersion: PROTOCOL_VERSION })
        .success,
    ).toBe(true);
  });

  it('pulls from version 0 (snapshot) or later, never negative', () => {
    expect(
      pullSchema.safeParse({ spaceId: newId(), since: 0, timeline: '' })
        .success,
    ).toBe(true);
    expect(
      pullSchema.safeParse({ spaceId: newId(), since: 12, timeline: 't' })
        .success,
    ).toBe(true);
    expect(
      pullSchema.safeParse({ spaceId: newId(), since: -1, timeline: '' })
        .success,
    ).toBe(false);
    expect(
      pullSchema.safeParse({ spaceId: newId(), since: 1.5, timeline: '' })
        .success,
    ).toBe(false);
  });

  it('needs the timeline the client holds', () => {
    expect(pullSchema.safeParse({ spaceId: newId(), since: 0 }).success).toBe(
      false,
    );
  });

  it(`pushes 1 to ${MAX_PUSH_MUTATIONS} valid mutations`, () => {
    const push = (n: number) => ({
      mutations: Array.from({ length: n }, deleteMutation),
    });

    expect(pushSchema.safeParse(push(1)).success).toBe(true);
    expect(pushSchema.safeParse(push(MAX_PUSH_MUTATIONS)).success).toBe(true);
    expect(pushSchema.safeParse(push(0)).success).toBe(false);
    expect(pushSchema.safeParse(push(MAX_PUSH_MUTATIONS + 1)).success).toBe(
      false,
    );
  });

  it('accepts a push with an invalid mutation, so that one can be rejected by id', () => {
    const bad = { ...deleteMutation(), name: 'item.toggle' };

    const result = pushSchema.safeParse({ mutations: [deleteMutation(), bad] });

    expect(result.success).toBe(true);
    expect(result.data?.mutations[1]).toMatchObject({
      mutationId: bad.mutationId,
    });
  });

  it('refuses a push whose entries carry no readable mutation id', () => {
    expect(
      pushSchema.safeParse({ mutations: [{ name: 'item.delete' }] }).success,
    ).toBe(false);
    expect(
      pushSchema.safeParse({ mutations: [{ mutationId: 'abc' }] }).success,
    ).toBe(false);
  });

  it('describes welcome, rows, ack, reject and poke', () => {
    const l = list();
    const rows = { lists: [l], items: [item(l.id)] };

    expect(
      welcomeSchema.safeParse({
        userId: newId(),
        spaces: [
          {
            id: newId(),
            name: 'Home',
            version: 7,
            members: [{ userId: newId(), displayName: 'Ann' }],
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      rowsSchema.safeParse({
        spaceId: newId(),
        version: 7,
        timeline: 'tl',
        snapshot: true,
        rows,
      }).success,
    ).toBe(true);
    expect(
      pokeSchema.safeParse({ spaceId: newId(), version: 8, rows }).success,
    ).toBe(true);
    expect(
      ackSchema.safeParse({ mutationId: newId(), version: 8 }).success,
    ).toBe(true);
    expect(
      rejectSchema.safeParse({
        mutationId: newId(),
        reason: 'Would create a loop',
      }).success,
    ).toBe(true);
    expect(
      rejectSchema.safeParse({ mutationId: newId(), reason: '' }).success,
    ).toBe(false);
  });

  it('carries tombstones', () => {
    const tombstone = { ...list(), deletedAt: 1_700_000_000_500 };

    expect(
      rowsSchema.safeParse({
        spaceId: newId(),
        version: 1,
        timeline: 'tl',
        snapshot: false,
        rows: { lists: [tombstone], items: [] },
      }).success,
    ).toBe(true);
  });

  it('ignores fields and tables a newer server adds (old clients keep working)', () => {
    const result = rowsSchema.safeParse({
      spaceId: newId(),
      version: 1,
      timeline: 'tl',
      snapshot: false,
      futureFlag: true,
      rows: {
        lists: [{ ...list(), futureField: 'hiking' }],
        items: [],
        trips: [],
      },
    });

    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('futureFlag');
    expect(result.data?.rows).not.toHaveProperty('trips');
    expect(result.data?.rows.lists[0]).not.toHaveProperty('futureField');
    expect(
      welcomeSchema.safeParse({ userId: newId(), spaces: [], isAdmin: true })
        .success,
    ).toBe(true);
  });

  it('reads a list colour or icon a newer app added as none, keeping the rest of the message (D26)', () => {
    const known = { ...list(), colour: 'teal', icon: 'camping' };
    const result = rowsSchema.safeParse({
      spaceId: newId(),
      version: 1,
      timeline: 'tl',
      snapshot: false,
      rows: {
        lists: [{ ...list(), colour: 'ultraviolet', icon: 'kayaking' }, known],
        items: [],
      },
    });

    expect(result.success).toBe(true);
    expect(result.data?.rows.lists).toEqual([
      expect.objectContaining({ colour: null, icon: null }),
      expect.objectContaining({ colour: 'teal', icon: 'camping' }),
    ]);
  });

  it('reads rows from a server that sends no includes yet as none', () => {
    const result = rowsSchema.parse({
      spaceId: newId(),
      version: 1,
      timeline: 'tl',
      snapshot: false,
      rows: { lists: [], items: [] },
    });
    expect(result.rows.includes).toEqual([]);
  });

  it('stays strict about what clients send', () => {
    expect(
      pullSchema.safeParse({ spaceId: newId(), since: 0, extra: 1 }).success,
    ).toBe(false);
  });
});
