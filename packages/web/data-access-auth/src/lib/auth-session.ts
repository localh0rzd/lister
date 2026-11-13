import { DOCUMENT } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  DestroyRef,
  Injector,
  Service,
  computed,
  inject,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  type ChangePasswordRequest,
  type CurrentUser,
  type LoginRequest,
  type SetupRequest,
  type UpdateProfileRequest,
  apiPath,
} from '@lister/shared/api-contracts';
import { PageNavigator } from './page-navigator';

/** Where the last known user is kept, so the app opens signed in while the server is out of reach. */
export const USER_STORAGE_KEY = 'lister.user';

/** The `meta` key under which the sync engine records whose data the local database holds. */
const LOCAL_USER_KEY = 'userId';

/** Why signing in or out failed, in words for the user. */
export function describeAuthError(
  error: unknown,
  fallback = 'Something went wrong. Try again.',
): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0)
      return 'You are offline. Try again when you are back online.';
    const message = (error.error as { message?: unknown } | null)?.message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message) && typeof message[0] === 'string')
      return message[0];
    if (error.status === 429)
      return 'Too many attempts. Wait a moment and try again.';
  }
  return fallback;
}

/**
 * Who is signed in (design §2.3). The session itself is the server's cookie; this service asks
 * `GET /api/auth/me` for the user and remembers the answer on the device, so the app keeps
 * working offline after the session has expired and asks for sign-in once it is online again
 * (the sync engine reports the refusal).
 */
@Service()
export class AuthSession {
  private readonly http = inject(HttpClient);
  private readonly injector = inject(Injector);
  private readonly navigator = inject(PageNavigator);
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly current = signal<CurrentUser | null>(null);
  private pending?: Promise<CurrentUser | null>;

  /** The signed-in user, or `null` before the first check or when signed out. */
  readonly user = this.current.asReadonly();
  readonly isAdmin = computed(() => this.current()?.isAdmin === true);

  constructor() {
    // Signing in or out in another tab stores the user there (`remember`). This tab must not
    // carry on as the previous user, so it starts afresh; the same user is simply kept up to date.
    const followOtherTabs = (event: StorageEvent) => {
      if (event.key !== USER_STORAGE_KEY) return;
      const stored = parseUser(event.newValue);
      if (!stored) {
        if (this.current()) this.navigator.load('/sign-in');
      } else if (stored.id === this.current()?.id) {
        this.current.set(stored);
        this.pending = Promise.resolve(stored);
      } else {
        this.navigator.load('/');
      }
    };
    this.window?.addEventListener('storage', followOtherTabs);
    inject(DestroyRef).onDestroy(() =>
      this.window?.removeEventListener('storage', followOtherTabs),
    );
  }

  /** The user, asked of the server once and remembered afterwards (route guards use this). */
  ensure(): Promise<CurrentUser | null> {
    return (this.pending ??= this.refresh());
  }

  /**
   * Asks the server who is signed in. 401 means nobody. An unreachable server (offline) leaves
   * the last known user in place, so the app still opens.
   */
  refresh(): Promise<CurrentUser | null> {
    const request = firstValueFrom(
      this.http.get<CurrentUser>(apiPath('auth', 'me')),
    ).then(
      (user) => this.remember(user),
      (error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 401) {
          return this.remember(null);
        }
        const cached = this.current() ?? this.readStored();
        this.current.set(cached);
        return cached;
      },
    );
    this.pending = request;
    return request;
  }

  async signIn(request: LoginRequest): Promise<CurrentUser> {
    const user = await firstValueFrom(
      this.http.post<CurrentUser>(apiPath('auth', 'login'), request),
    );
    return this.startSession(user);
  }

  /** First-run setup: creates the first account, an admin, and signs it in. */
  async setUp(request: SetupRequest): Promise<CurrentUser> {
    const user = await firstValueFrom(
      this.http.post<CurrentUser>(apiPath('auth', 'setup'), request),
    );
    return this.startSession(user);
  }

  async changePassword(request: ChangePasswordRequest): Promise<CurrentUser> {
    const user = await firstValueFrom(
      this.http.post<CurrentUser>(apiPath('auth', 'password'), request),
    );
    return this.remember(user);
  }

  async updateProfile(request: UpdateProfileRequest): Promise<CurrentUser> {
    const user = await firstValueFrom(
      this.http.patch<CurrentUser>(apiPath('auth', 'me'), request),
    );
    return this.remember(user);
  }

  /**
   * The local database, loaded on demand: Dexie stays out of the initial bundle, which holds the
   * route guards that use this service.
   */
  private async local() {
    const local = await import('@lister/web/data-access-local-db');
    return { ...local, db: this.injector.get(local.LOCAL_DB) };
  }

  /**
   * Ends the session on the server, wipes what this device holds of the user (lists, runs,
   * pending changes) and loads the sign-in page. Callers warn about unsynced changes first. It
   * fails while offline: a session that could not be ended must not look ended.
   */
  async signOut(): Promise<void> {
    await firstValueFrom(this.http.post<void>(apiPath('auth', 'logout'), {}));
    const { db, CURRENT_SPACE_KEY } = await this.local();
    await db.clearAll();
    this.forgetUserState(CURRENT_SPACE_KEY);
    this.remember(null);
    this.navigator.load('/sign-in');
  }

  /**
   * Whoever signs in on a device that still holds another user's data (their lists, and changes
   * the server never got) must not see or send it: it is wiped. The same user keeps everything,
   * pending changes included, so they sync once the session is back.
   */
  private async startSession(user: CurrentUser): Promise<CurrentUser> {
    const { db, CURRENT_SPACE_KEY, DISCARDED_CHANGES_KEY } = await this.local();
    const holder = (await db.meta.get(LOCAL_USER_KEY))?.value;
    if (holder !== undefined && holder !== user.id) {
      // The previous user's outbox must never be pushed under this session.
      const discarded = await db.outbox.count();
      await db.clearAll();
      this.forgetUserState(CURRENT_SPACE_KEY);
      if (discarded > 0) this.store(DISCARDED_CHANGES_KEY, String(discarded));
    }
    return this.remember(user);
  }

  /** Per-user state kept outside the database; device preferences such as the theme stay. */
  private forgetUserState(spaceKey: string): void {
    try {
      this.window?.localStorage.removeItem(spaceKey);
    } catch {
      // Storage is blocked: nothing was remembered.
    }
  }

  private store(key: string, value: string): void {
    try {
      this.window?.localStorage.setItem(key, value);
    } catch {
      // Storage is blocked: the notice is skipped.
    }
  }

  private remember<T extends CurrentUser | null>(user: T): T {
    this.current.set(user);
    // What the route guards get from `ensure()` is now this.
    this.pending = Promise.resolve(user);
    try {
      if (user)
        this.window?.localStorage.setItem(
          USER_STORAGE_KEY,
          JSON.stringify(user),
        );
      else this.window?.localStorage.removeItem(USER_STORAGE_KEY);
    } catch {
      // Storage is blocked: the user is known until the page is reloaded.
    }
    return user;
  }

  private readStored(): CurrentUser | null {
    try {
      return parseUser(this.window?.localStorage.getItem(USER_STORAGE_KEY));
    } catch {
      return null;
    }
  }
}

function parseUser(stored: string | null | undefined): CurrentUser | null {
  try {
    return stored ? (JSON.parse(stored) as CurrentUser) : null;
  } catch {
    return null;
  }
}
