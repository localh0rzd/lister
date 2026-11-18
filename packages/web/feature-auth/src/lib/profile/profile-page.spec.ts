import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthSession, WebAuthnClient } from '@lister/web/data-access-auth';
import { Notifier } from '@lister/web/util-notify';
import { makeUser } from '@lister/shared/testing';
import { ProfilePage } from './profile-page';

const user = makeUser({
  username: 'anna',
  displayName: 'Anna',
  visibleToOthers: false,
});

function setup() {
  const current = signal(user);
  const session = {
    user: current,
    updateProfile: vi.fn(async (r: Partial<typeof user>) => {
      current.update((u) => ({ ...u, ...r }));
      return current();
    }),
    changePassword: vi.fn(),
  };
  const notify = vi.fn(async () => 'dismissed');
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: WebAuthnClient,
        useValue: { supported: () => true },
      },
      { provide: AuthSession, useValue: session },
      { provide: Notifier, useValue: { notify } },
    ],
  });
  return { session, notify };
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

  it('turns "Visible to other users" on, and puts it back when saving fails', async () => {
    const { session } = setup();
    const { fixture, element } = await render();
    const toggle = () =>
      element.querySelector<HTMLButtonElement>('button[role="switch"]');
    expect(element.textContent).toContain(
      'Others can find you when they add members to a space',
    );
    expect(toggle()?.getAttribute('aria-checked')).toBe('false');
    const hintId = toggle()?.getAttribute('aria-describedby') ?? '';
    expect(element.querySelector(`#${hintId}`)?.textContent).toContain(
      'Others can find you',
    );

    toggle()?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(session.updateProfile).toHaveBeenCalledWith({
      visibleToOthers: true,
    });
    expect(toggle()?.getAttribute('aria-checked')).toBe('true');

    session.updateProfile.mockRejectedValueOnce(new Error('offline'));
    toggle()?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'not saved',
    );
    expect(toggle()?.getAttribute('aria-checked')).toBe('true');
  });
});
