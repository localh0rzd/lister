import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import type { CurrentUser } from '@lister/shared/api-contracts';
import { newId } from '@lister/shared/domain';
import {
  CURRENT_SPACE_KEY,
  DISCARDED_CHANGES_KEY,
  LOCAL_DB,
  LocalDb,
} from '@lister/web/data-access-local-db';
import {
  AuthSession,
  USER_STORAGE_KEY,
  describeAuthError,
} from './auth-session';
import { PageNavigator } from './page-navigator';

const anna: CurrentUser = {
  id: newId(),
  username: 'anna',
  displayName: 'Anna',
  isAdmin: false,
  mustChangePassword: false,
};

let db: LocalDb;
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
