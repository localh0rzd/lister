import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthSession, PageNavigator } from '@lister/web/data-access-auth';
import { ChangePasswordPage } from './change-password-page';

describe('ChangePasswordPage', () => {
  it('greets the user and loads the app once the password is changed', async () => {
    const load = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: PageNavigator, useValue: { load } },
        {
          provide: AuthSession,
          useValue: { user: signal({ displayName: 'Anna' }) },
        },
      ],
    });
    const fixture = TestBed.createComponent(ChangePasswordPage);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain(
      'Anna, an administrator set a temporary password',
    );
    expect(element.textContent).toContain('Temporary password');

    fixture.debugElement.children[2].triggerEventHandler('changed');
    expect(load).toHaveBeenCalledWith('/');
  });
});
