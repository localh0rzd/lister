import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { AuthSession } from '@lister/web/data-access-auth';
import { SyncEngine } from '@lister/web/data-access-sync';
import { SignOutSection } from './sign-out-section';

function setup(pending = 0, dialogResult = true) {
  const session = { signOut: vi.fn(async () => undefined) };
  const open = vi.fn(() => ({ afterClosed: () => of(dialogResult) }));
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthSession, useValue: session },
      { provide: SyncEngine, useValue: { pendingCount: signal(pending) } },
      { provide: MatDialog, useValue: { open } },
    ],
  });
  return { session, open };
}

function render() {
  const fixture = TestBed.createComponent(SignOutSection);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    element,
    click: () => element.querySelector('button')?.click(),
  };
}

describe('SignOutSection', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('signs out at once when everything is synced', async () => {
    const { session, open } = setup(0);
    render().click();

    await vi.waitFor(() => expect(session.signOut).toHaveBeenCalled());
    expect(open).not.toHaveBeenCalled();
  });

  it('warns about unsynced changes first, and signs out when confirmed', async () => {
    const { session, open } = setup(3, true);
    render().click();

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
    render().click();
    await vi.waitFor(() => expect(open).toHaveBeenCalled());

    expect(session.signOut).not.toHaveBeenCalled();
  });

  it('explains a failed sign-out, e.g. while offline', async () => {
    const { session } = setup(0);
    session.signOut.mockRejectedValue(new HttpErrorResponse({ status: 0 }));
    const { fixture, element, click } = render();
    click();

    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(element.querySelector('[role="alert"]')?.textContent).toContain(
        'offline',
      );
    });
  });
});
