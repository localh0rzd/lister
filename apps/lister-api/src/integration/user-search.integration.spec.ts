import type {
  SpaceSummary,
  UserSuggestion,
} from '@lister/shared/api-contracts';
import { createAccount, send, signIn } from '../testing/auth-client';
import { type TestApp, createTestApp } from '../testing/create-test-app';

describe('finding users to add to a space (D27)', () => {
  let api: TestApp;
  let annaCookie: string;

  beforeEach(async () => {
    api = await createTestApp();
    await createAccount(api, 'anna');
    annaCookie = await signIn(api, 'anna');
  });
  afterEach(() => api.close());

  const makeVisible = async (username: string, visible = true) =>
    send(api, 'PATCH', '/auth/me', {
      cookie: await signIn(api, username),
      body: { visibleToOthers: visible },
    });

  const search = async (q: string, extra = '') => {
    const response = await send(
      api,
      'GET',
      `/user-search?q=${encodeURIComponent(q)}${extra}`,
      { cookie: annaCookie },
    );
    return { status: response.status, body: (await response.json()) as never };
  };

  it('is off by default and the profile switch turns it on and off', async () => {
    await createAccount(api, 'ben');
    expect((await search('ben')).body).toEqual([]);

    const on = await makeVisible('ben');
    expect(await on.json()).toMatchObject({ visibleToOthers: true });
    expect(((await search('ben')).body as UserSuggestion[]).length).toBe(1);

    await makeVisible('ben', false);
    expect((await search('ben')).body).toEqual([]);
  });

  it('returns only visible users, by username or display name, without the caller', async () => {
    const ben = await createAccount(api, 'ben');
    await createAccount(api, 'benedict');
    await createAccount(api, 'carl');
    await makeVisible('ben');
    await makeVisible('anna');
    await makeVisible('carl');

    const { status, body } = await search('BEN');

    expect(status).toBe(200);
    expect(body).toEqual([
      { id: ben.id, username: 'ben', displayName: 'ben display' },
    ]);
    expect((await search('display')).body as UserSuggestion[]).toHaveLength(2);
  });

  it('returns at most 10 users', async () => {
    for (let i = 0; i < 12; i++) {
      await createAccount(api, `user${i}`);
      await makeVisible(`user${i}`);
    }
    expect(((await search('user')).body as UserSuggestion[]).length).toBe(10);
  });

  it('leaves out the members of the space', async () => {
    const ben = await createAccount(api, 'ben');
    await createAccount(api, 'bella');
    await makeVisible('ben');
    await makeVisible('bella');
    const space = (await (
      await send(api, 'POST', '/spaces', {
        cookie: annaCookie,
        body: { name: 'Family' },
      })
    ).json()) as SpaceSummary;
    await send(api, 'POST', `/spaces/${space.id}/members`, {
      cookie: annaCookie,
      body: { username: 'ben' },
    });

    const { body } = await search('be', `&spaceId=${space.id}`);

    expect((body as UserSuggestion[]).map((u) => u.id)).not.toContain(ben.id);
    expect((body as UserSuggestion[]).map((u) => u.username)).toEqual([
      'bella',
    ]);
  });

  it('still lets a hidden user be added by exact username', async () => {
    await createAccount(api, 'ben');
    const space = (await (
      await send(api, 'POST', '/spaces', {
        cookie: annaCookie,
        body: { name: 'Family' },
      })
    ).json()) as SpaceSummary;

    const response = await send(api, 'POST', `/spaces/${space.id}/members`, {
      cookie: annaCookie,
      body: { username: 'ben' },
    });

    expect(response.status).toBe(201);
  });

  it('needs a session and a query of 2 or more characters', async () => {
    expect((await send(api, 'GET', '/user-search?q=be')).status).toBe(401);
    expect((await search('b')).status).toBe(400);
    expect((await search('  ')).status).toBe(400);
    expect((await search('be', '&spaceId=nope')).status).toBe(400);
  });

  it('answers 429 after 60 searches in a minute', async () => {
    for (let i = 0; i < 60; i++) await search('zz');
    expect((await search('zz')).status).toBe(429);
  });
});
