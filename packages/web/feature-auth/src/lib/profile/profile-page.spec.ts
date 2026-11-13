import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of } from 'rxjs';
import { AuthSession, WebAuthnClient } from '@lister/web/data-access-auth';
import { SyncEngine } from '@lister/web/data-access-sync';
import { Notifier } from '@lister/web/util-notify';
import { ProfilePage } from './profile-page';

const user = {
  id: 'u1',
  username: 'anna',
  displayName: 'Anna',
  isAdmin: false,
  mustChangePassword: false,
};

function setup(pending = 0, dialogResult: boolean | undefined = true) {
  const current = signal(user);
  const session = {
    user: current,
    updateProfile: vi.fn(async (r: { displayName: string }) => {
      current.update((u) => ({ ...u, ...r }));
      return current();
    }),
    signOut: vi.fn(async () => undefined),
    changePassword: vi.fn(),
  };
  const open = vi.fn(() => ({ afterClosed: () => of(dialogResult) }));
  const notify = vi.fn(async () => 'dismissed');
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: WebAuthnClient,
        useValue: { supported: async () => true },
      },
      { provide: AuthSession, useValue: session },
      { provide: SyncEngine, useValue: { pendingCount: signal(pending) } },
      { provide: MatDialog, useValue: { open } },
      { provide: Notifier, useValue: { notify } },
    ],
  });
  return { session, open, notify };
}

async function render() {
  const fixture = TestBed.createComponent(ProfilePage);
  fixture.detectChanges();
  // The passkeys section loads its list.
  const list = await vi.waitFor(() =>
    TestBed.inject(HttpTestingController).expectOne('/api/passkeys'),
  );
  list.flush([]);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const button = (name: string) =>
    [...element.querySelectorAll('button')].find((b) =>
      b.textContent?.includes(name),
    ) as HTMLButtonElement;
  return { fixture, element, button };
}

afterEach(() => TestBed.resetTestingModule());

describe('ProfilePage', () => {
  it('shows who is signed in, with the name ready to edit', async () => {
    setup();
    const { element } = await render();

    expect(element.textContent).toContain('anna');
    expect(
      element.querySelector<HTMLInputElement>('input[autocomplete="name"]')
        ?.value,
    ).toBe('Anna');
  });

  it('saves a changed display name, trimmed, and says so', async () => {
    const { session, notify } = setup();
    const { fixture, element, button } = await render();
    const input = element.querySelector<HTMLInputElement>(
      'input[autocomplete="name"]',
    ) as HTMLInputElement;
    expect(button('Save name').disabled).toBe(true); // nothing changed yet

    input.value = '  Anna B ';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    element.querySelector('form')?.dispatchEvent(new Event('submit'));

    await vi.waitFor(() =>
      expect(session.updateProfile).toHaveBeenCalledWith({
        displayName: 'Anna B',
      }),
    );
    await vi.waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Name saved' }),
      ),
    );
  });

  it('refuses an empty display name', async () => {
    const { session } = setup();
    const { fixture, element } = await render();
    const input = element.querySelector<HTMLInputElement>(
      'input[autocomplete="name"]',
    ) as HTMLInputElement;
    input.value = '  ';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    element.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(session.updateProfile).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Enter your name');
  });

  describe('signing out', () => {
    it('signs out at once when everything is synced', async () => {
      const { session, open } = setup(0);
      const { button } = await render();

      button('Sign out').click();

      await vi.waitFor(() => expect(session.signOut).toHaveBeenCalled());
      expect(open).not.toHaveBeenCalled();
    });

    it('warns about unsynced changes first, and signs out when confirmed', async () => {
      const { session, open } = setup(3, true);
      const { button } = await render();

      button('Sign out').click();

      await vi.waitFor(() => expect(session.signOut).toHaveBeenCalled());
      expect(open).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          data: expect.objectContaining({
            message: expect.stringContaining('3 changes have not reached'),
          }),
        }),
      );
    });

    it('stays signed in when the warning is declined', async () => {
      const { session, open } = setup(1, false);
      const { button } = await render();

      button('Sign out').click();
      await vi.waitFor(() => expect(open).toHaveBeenCalled());

      expect(session.signOut).not.toHaveBeenCalled();
    });

    it('explains a failed sign-out, e.g. while offline', async () => {
      const { session } = setup(0);
      session.signOut.mockRejectedValue(new HttpErrorResponse({ status: 0 }));
      const { fixture, element, button } = await render();

      button('Sign out').click();

      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(element.querySelector('[role="alert"]')?.textContent).toContain(
          'offline',
        );
      });
    });
  });
});
