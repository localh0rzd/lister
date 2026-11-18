import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import type { CurrentUser } from '@lister/shared/api-contracts';
import { newId } from '@lister/shared/domain';
import { Diagnostics } from '@lister/web/util-diagnostics';
import type { LocalDb as LocalDbType } from '@lister/web/data-access-local-db';
import {
  AuthSession,
  USER_STORAGE_KEY,
  describeAuthError,
} from './auth-session';
import { PageNavigator } from './page-navigator';
import { WebAuthnClient } from './webauthn-client';

const anna: CurrentUser = {
  id: newId(),
  username: 'anna',
  displayName: 'Anna',
  isAdmin: false,
  mustChangePassword: false,
};

const {
  CURRENT_SPACE_KEY,
  DISCARDED_CHANGES_KEY,
  LOCAL_DB,
  LocalDb,
  SYNC_STATUS_KEY,
} = await import('@lister/web/data-access-local-db');

let db: LocalDbType;
let http: HttpTestingController;
let session: AuthSession;
const load = vi.fn();

beforeEach(() => {
  localStorage.removeItem(USER_STORAGE_KEY);
  localStorage.removeItem(CURRENT_SPACE_KEY);
  localStorage.removeItem(DISCARDED_CHANGES_KEY);
  load.mockClear();
  db = new LocalDb(`test-${newId()}`);
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: LOCAL_DB, useValue: db },
      { provide: PageNavigator, useValue: { load } },
    ],
  });
  http = TestBed.inject(HttpTestingController);
  session = TestBed.inject(AuthSession);
});
afterEach(async () => {
  http.verify();
  TestBed.resetTestingModule();
  await db.delete();
});

const flushMe = (user: CurrentUser) =>
  http.expectOne('/api/auth/me').flush(user);

describe('AuthSession', () => {
  describe('ensure / refresh', () => {
    it('knows the user from the server, and remembers them on the device', async () => {
      const result = session.ensure();
      flushMe(anna);

      expect(await result).toEqual(anna);
      expect(session.user()).toEqual(anna);
      expect(JSON.parse(localStorage.getItem(USER_STORAGE_KEY) ?? '')).toEqual(
        anna,
      );
    });

    it('asks the server only once for ensure(), and again for refresh()', async () => {
      const first = session.ensure();
      flushMe(anna);
      await first;

      expect(await session.ensure()).toEqual(anna); // no second request

      const again = session.refresh();
      flushMe({ ...anna, displayName: 'Anna B' });
      expect((await again)?.displayName).toBe('Anna B');
    });

    it('is signed out on a 401, and forgets the remembered user', async () => {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(anna));

      const result = session.ensure();
      http
        .expectOne('/api/auth/me')
        .flush({ message: 'Sign in first' }, { status: 401, statusText: '' });

      expect(await result).toBeNull();
      expect(session.user()).toBeNull();
      expect(localStorage.getItem(USER_STORAGE_KEY)).toBeNull();
    });

    it('keeps working with the remembered user when the server is out of reach', async () => {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(anna));

      const result = session.ensure();
      http.expectOne('/api/auth/me').error(new ProgressEvent('error'));

      expect(await result).toEqual(anna);
      expect(session.user()).toEqual(anna);
    });

    it('is signed out when offline and nobody was ever signed in', async () => {
      const result = session.ensure();
      http.expectOne('/api/auth/me').error(new ProgressEvent('error'));

      expect(await result).toBeNull();
    });
  });

  it('answers the guards with the user who just signed in, not with the earlier "nobody"', async () => {
    const before = session.refresh();
    http
      .expectOne('/api/auth/me')
      .flush({ message: 'Sign in first' }, { status: 401, statusText: '' });
    expect(await before).toBeNull();

    const signingIn = session.signIn({
      username: 'anna',
      password: 'a password',
    });
    http.expectOne('/api/auth/login').flush(anna);
    await signingIn;

    expect(await session.ensure()).toEqual(anna);
  });

  describe('signIn', () => {
    const request = { username: 'anna', password: 'a password' };

    async function signIn(user: CurrentUser) {
      const result = session.signIn(request);
      const call = http.expectOne('/api/auth/login');
      expect(call.request.body).toEqual(request);
      call.flush(user);
      return result;
    }

    it('knows the user afterwards, and keeps what the device holds of them', async () => {
      await db.meta.put({ key: 'userId', value: anna.id });
      await db.outbox.add({
        mutationId: newId(),
        spaceId: newId(),
        mutation: {
          mutationId: newId(),
          spaceId: newId(),
          name: 'list.delete',
          args: { id: newId() },
        },
        createdAt: 1,
      });

      expect(await signIn(anna)).toEqual(anna);

      expect(session.user()).toEqual(anna);
      expect(await db.outbox.count()).toBe(1);
    });

    it("wipes another user's data from the device, pending changes included", async () => {
      await db.meta.put({ key: 'userId', value: newId() });
      await db.spaces.put({
        id: newId(),
        name: 'Theirs',
        version: 1,
        members: [],
      });

      await signIn(anna);

      expect(await db.spaces.count()).toBe(0);
      expect(await db.meta.count()).toBe(0);
    });

    it("tells the new user that the previous user's unsynced changes were discarded", async () => {
      await db.meta.put({ key: 'userId', value: newId() });
      for (let i = 0; i < 2; i++)
        await db.outbox.add({
          mutationId: newId(),
          spaceId: newId(),
          mutation: {
            mutationId: newId(),
            spaceId: newId(),
            name: 'list.delete',
            args: { id: newId() },
          },
          createdAt: 1,
        });
      localStorage.setItem(CURRENT_SPACE_KEY, 'old-space');

      await signIn(anna);

      expect(await db.outbox.count()).toBe(0);
      expect(localStorage.getItem(DISCARDED_CHANGES_KEY)).toBe('2');
      expect(localStorage.getItem(CURRENT_SPACE_KEY)).toBeNull();
    });

    it('does not bother the new user when nothing was discarded', async () => {
      await db.meta.put({ key: 'userId', value: newId() });
      await signIn(anna);
      expect(localStorage.getItem(DISCARDED_CHANGES_KEY)).toBeNull();
    });

    it('keeps the remembered space when the same user signs in again', async () => {
      await db.meta.put({ key: 'userId', value: anna.id });
      localStorage.setItem(CURRENT_SPACE_KEY, 'my-space');
      await signIn(anna);
      expect(localStorage.getItem(CURRENT_SPACE_KEY)).toBe('my-space');
    });

    it('leaves a device that holds nothing yet alone', async () => {
      await signIn(anna);
      expect(session.user()).toEqual(anna);
    });

    it('fails with the server error and stays signed out', async () => {
      const result = session.signIn(request);
      http
        .expectOne('/api/auth/login')
        .flush({ message: 'Wrong' }, { status: 401, statusText: '' });

      await expect(result).rejects.toMatchObject({ status: 401 });
      expect(session.user()).toBeNull();
    });
  });

  describe('signInWithPasskey', () => {
    const assertion = { id: 'cred', response: { signature: 's' } };

    function start(user: CurrentUser) {
      const authenticate = vi
        .spyOn(TestBed.inject(WebAuthnClient), 'authenticate')
        .mockResolvedValue(assertion);
      const result = session.signInWithPasskey();
      return {
        authenticate,
        result,
        async answer() {
          const options = http.expectOne('/api/auth/passkey/options');
          expect(options.request.method).toBe('POST');
          options.flush({ challenge: 'c1' });
          await vi.waitFor(() => expect(authenticate).toHaveBeenCalled());
          const login = http.expectOne('/api/auth/passkey/login');
          expect(login.request.body).toEqual({ response: assertion });
          login.flush(user);
        },
      };
    }

    it('asks the authenticator for the server challenge and signs in with its answer', async () => {
      const { authenticate, result, answer } = start(anna);
      await answer();

      expect(await result).toEqual(anna);
      expect(authenticate).toHaveBeenCalledWith({ challenge: 'c1' });
      expect(session.user()).toEqual(anna);
      expect(JSON.parse(localStorage.getItem(USER_STORAGE_KEY) ?? '')).toEqual(
        anna,
      );
    });

    it("wipes another user's data from the device like a password sign-in does", async () => {
      await db.meta.put({ key: 'userId', value: newId() });
      await db.spaces.put({
        id: newId(),
        name: 'Theirs',
        version: 1,
        members: [],
      });
      const { result, answer } = start(anna);
      await answer();
      await result;

      expect(await db.spaces.count()).toBe(0);
    });

    it('keeps the forced password change flag, for the page to act on', async () => {
      const forced = { ...anna, mustChangePassword: true };
      const { result, answer } = start(forced);
      await answer();

      expect((await result).mustChangePassword).toBe(true);
      expect(session.user()?.mustChangePassword).toBe(true);
    });

    it('stays signed out when the authenticator is dismissed', async () => {
      vi.spyOn(
        TestBed.inject(WebAuthnClient),
        'authenticate',
      ).mockRejectedValue(new DOMException('cancelled', 'NotAllowedError'));
      const result = session.signInWithPasskey();
      http.expectOne('/api/auth/passkey/options').flush({ challenge: 'c1' });

      await expect(result).rejects.toMatchObject({ name: 'NotAllowedError' });
      expect(session.user()).toBeNull();
    });

    it('stops waiting for a prompt that never answers once cancelled', async () => {
      const authenticate = vi
        .spyOn(TestBed.inject(WebAuthnClient), 'authenticate')
        .mockReturnValue(new Promise(() => undefined));
      const cancelled = new AbortController();
      const result = session.signInWithPasskey(cancelled.signal);
      http.expectOne('/api/auth/passkey/options').flush({ challenge: 'c1' });
      await vi.waitFor(() => expect(authenticate).toHaveBeenCalled());

      cancelled.abort();

      await expect(result).rejects.toMatchObject({ name: 'AbortError' });
      http.expectNone('/api/auth/passkey/login');
    });

    it('forgets the sign-in-required status that the signed-out visit left behind', async () => {
      await db.meta.put({
        key: SYNC_STATUS_KEY,
        value: JSON.stringify({
          online: false,
          syncing: false,
          updateRequired: false,
          signInRequired: true,
        }),
      });
      const { result, answer } = start(anna);
      await answer();
      await result;

      expect(await db.meta.get(SYNC_STATUS_KEY)).toBeUndefined();
    });

    it('does not start the prompt when cancelled while the options were loading', async () => {
      const authenticate = vi.spyOn(
        TestBed.inject(WebAuthnClient),
        'authenticate',
      );
      const cancelled = new AbortController();
      const result = session.signInWithPasskey(cancelled.signal);
      const options = http.expectOne('/api/auth/passkey/options');

      cancelled.abort();
      options.flush({ challenge: 'c1' });

      await expect(result).rejects.toMatchObject({ name: 'AbortError' });
      expect(authenticate).not.toHaveBeenCalled();
      expect(session.user()).toBeNull();
    });

    it('fails with the server error when it refuses the passkey', async () => {
      const authenticate = vi
        .spyOn(TestBed.inject(WebAuthnClient), 'authenticate')
        .mockResolvedValue(assertion);
      const result = session.signInWithPasskey();
      http.expectOne('/api/auth/passkey/options').flush({ challenge: 'c1' });
      await vi.waitFor(() => expect(authenticate).toHaveBeenCalled());
      http
        .expectOne('/api/auth/passkey/login')
        .flush(
          { message: 'Passkey sign-in failed' },
          { status: 401, statusText: '' },
        );

      await expect(result).rejects.toBeInstanceOf(HttpErrorResponse);
      expect(session.user()).toBeNull();
    });
  });

  it('sets up the first account and signs it in', async () => {
    const admin = { ...anna, isAdmin: true };
    const result = session.setUp({
      token: 't',
      username: 'anna',
      displayName: 'Anna',
      password: 'a password',
    });
    http.expectOne('/api/auth/setup').flush(admin);

    expect(await result).toEqual(admin);
    expect(session.isAdmin()).toBe(true);
  });

  it('registers a regular user with a token and signs them in', async () => {
    const result = session.register({
      token: 'ABCD1234WXYZ',
      username: 'anna',
      displayName: 'Anna',
      password: 'a password',
    });
    http.expectOne('/api/auth/register').flush(anna);

    expect(await result).toEqual(anna);
    expect(session.user()).toEqual(anna);
    expect(session.isAdmin()).toBe(false);
  });

  it('forgets the sign-in-required status once the password is changed', async () => {
    // Recorded again on the change-password page: the server refuses the socket until then.
    await db.meta.put({
      key: SYNC_STATUS_KEY,
      value: JSON.stringify({
        online: false,
        syncing: false,
        updateRequired: false,
        signInRequired: true,
      }),
    });
    const changed = session.changePassword({
      currentPassword: 'temporary password',
      newPassword: 'new password',
    });
    http
      .expectOne('/api/auth/password')
      .flush({ ...anna, mustChangePassword: false });
    await changed;

    expect(await db.meta.get(SYNC_STATUS_KEY)).toBeUndefined();
  });

  it('remembers the user the server returns after a password change or a profile edit', async () => {
    const changed = session.changePassword({
      currentPassword: 'old password',
      newPassword: 'new password',
    });
    http
      .expectOne('/api/auth/password')
      .flush({ ...anna, mustChangePassword: false });
    await changed;

    const edited = session.updateProfile({ displayName: 'Anna B' });
    const call = http.expectOne('/api/auth/me');
    expect(call.request.method).toBe('PATCH');
    expect(call.request.body).toEqual({ displayName: 'Anna B' });
    call.flush({ ...anna, displayName: 'Anna B' });
    await edited;

    expect(session.user()?.displayName).toBe('Anna B');
  });

  describe('signOut', () => {
    it('ends the session, wipes the device and loads the sign-in page', async () => {
      const first = session.ensure();
      flushMe(anna);
      await first;
      await db.spaces.put({
        id: newId(),
        name: 'Home',
        version: 1,
        members: [],
      });

      const result = session.signOut();
      http
        .expectOne('/api/auth/logout')
        .flush(null, { status: 204, statusText: '' });
      await result;

      expect(await db.spaces.count()).toBe(0);
      expect(session.user()).toBeNull();
      expect(localStorage.getItem(USER_STORAGE_KEY)).toBeNull();
      expect(localStorage.getItem(CURRENT_SPACE_KEY)).toBeNull();
      expect(load).toHaveBeenCalledWith('/sign-in');
    });

    it('keeps the data and the session when the server cannot be reached', async () => {
      await db.spaces.put({
        id: newId(),
        name: 'Home',
        version: 1,
        members: [],
      });

      const result = session.signOut();
      http.expectOne('/api/auth/logout').error(new ProgressEvent('error'));

      await expect(result).rejects.toBeDefined();
      expect(await db.spaces.count()).toBe(1);
      expect(load).not.toHaveBeenCalled();
    });
  });

  describe('another tab', () => {
    const otherTabStores = (value: CurrentUser | null) =>
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: USER_STORAGE_KEY,
          newValue: value ? JSON.stringify(value) : null,
        }),
      );

    beforeEach(async () => {
      const first = session.ensure();
      flushMe(anna);
      await first;
    });

    it('loads the sign-in page when the user signed out there', () => {
      otherTabStores(null);

      expect(load).toHaveBeenCalledWith('/sign-in');
    });

    it('loads the app afresh when somebody else signed in there', () => {
      otherTabStores({ ...anna, id: newId(), username: 'ben' });

      expect(load).toHaveBeenCalledWith('/');
    });

    it('keeps going, with the new details, when the same user signed in or edited the profile there', () => {
      otherTabStores({ ...anna, displayName: 'Anna B' });

      expect(load).not.toHaveBeenCalled();
      expect(session.user()?.displayName).toBe('Anna B');
    });

    it('ignores other keys', () => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'lister.theme', newValue: 'dark' }),
      );

      expect(load).not.toHaveBeenCalled();
    });
  });
});

describe('AuthSession diagnostic log', () => {
  const logged = (
    log: { mock: { calls: readonly unknown[][] } },
    event: string,
  ) => log.mock.calls.filter(([, e]) => e === event).map(([, , data]) => data);

  it('logs who is signed in as ids, never names', async () => {
    const log = vi.spyOn(TestBed.inject(Diagnostics), 'log');
    const result = session.ensure();
    flushMe(anna);
    await result;

    expect(logged(log, 'user')).toEqual([
      { userId: anna.id, previousUserId: null, mustChangePassword: false },
    ]);
    expect(JSON.stringify(log.mock.calls)).not.toContain('Anna');
  });

  it('logs that the server could not be asked, and which user stays', async () => {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(anna));
    const log = vi.spyOn(TestBed.inject(Diagnostics), 'log');
    const result = session.ensure();
    http.expectOne('/api/auth/me').error(new ProgressEvent('error'));
    await result;

    expect(logged(log, 'me-unreachable')).toEqual([
      { status: 0, usingCachedUserId: anna.id },
    ]);
  });

  it('logs a 401 as "unauthorized", not as unreachable', async () => {
    const log = vi.spyOn(TestBed.inject(Diagnostics), 'log');
    const result = session.ensure();
    http.expectOne('/api/auth/me').flush('no', { status: 401, statusText: '' });
    await result;

    expect(logged(log, 'me-unauthorized')).toHaveLength(1);
    expect(logged(log, 'me-unreachable')).toHaveLength(0);
  });

  it('logs a sign-in without the password', async () => {
    const log = vi.spyOn(TestBed.inject(Diagnostics), 'log');
    const signingIn = session.signIn({
      username: 'anna',
      password: 'hunter2-secret',
    });
    http.expectOne('/api/auth/login').flush(anna);
    await signingIn;

    expect(logged(log, 'sign-in')).toEqual([
      { userId: anna.id, holderUserId: undefined, wipes: false },
    ]);
    expect(JSON.stringify(log.mock.calls)).not.toContain('hunter2');
  });
});

describe('describeAuthError', () => {
  it.each([
    [new HttpErrorResponse({ status: 0 }), /offline/],
    [
      new HttpErrorResponse({
        status: 401,
        error: { message: 'Wrong password' },
      }),
      /Wrong password/,
    ],
    [
      new HttpErrorResponse({
        status: 400,
        error: { message: ['too short', 'x'] },
      }),
      /too short/,
    ],
    [new HttpErrorResponse({ status: 429 }), /Too many/],
    [new Error('x'), /Something went wrong/],
  ])('explains %#', (error, expected) => {
    expect(describeAuthError(error)).toMatch(expected);
  });
});
