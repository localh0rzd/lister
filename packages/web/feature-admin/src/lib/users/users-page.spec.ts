import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuHarness } from '@angular/material/menu/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import type { CurrentUser } from '@lister/shared/api-contracts';
import { AuthSession } from '@lister/web/data-access-auth';
import { Notifier } from '@lister/web/util-notify';
import { UsersPage } from './users-page';

const user = (
  id: string,
  username: string,
  changes: Partial<CurrentUser> = {},
): CurrentUser => ({
  id,
  username,
  displayName: username.toUpperCase(),
  isAdmin: false,
  mustChangePassword: false,
  ...changes,
});
const boss = user('1', 'boss', { isAdmin: true });
const anna = user('2', 'anna', { mustChangePassword: true });

let http: HttpTestingController;
let open: ReturnType<typeof vi.fn>;
let notify: ReturnType<typeof vi.fn>;
let refresh: ReturnType<typeof vi.fn>;

async function render(dialogResult: unknown = undefined) {
  open = vi.fn(() => ({ afterClosed: () => of(dialogResult) }));
  notify = vi.fn(async () => 'dismissed');
  refresh = vi.fn(async () => null);
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: MatDialog, useValue: { open } },
      { provide: Notifier, useValue: { notify } },
      { provide: AuthSession, useValue: { user: signal(boss), refresh } },
    ],
  });
  http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(UsersPage);
  fixture.detectChanges();
  http.expectOne('/api/users').flush([boss, anna]);
  await fixture.whenStable();
  const loader = TestbedHarnessEnvironment.loader(fixture);
  const menu = async (name: string) =>
    loader.getHarness(
      MatMenuHarness.with({ selector: `[aria-label="More for ${name}"]` }),
    );
  return { fixture, element: fixture.nativeElement as HTMLElement, menu };
}

afterEach(() => {
  http.verify();
  TestBed.resetTestingModule();
});

describe('UsersPage', () => {
  it('lists every account with its role and whether it must pick a password', async () => {
    const { element } = await render();

    const rows = [...element.querySelectorAll('li.user')].map((li) =>
      li.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(rows[0]).toContain('BOSS');
    expect(rows[0]).toContain('Admin');
    expect(rows[1]).toContain('anna');
    expect(rows[1]).toContain('Must choose a password');
  });

  /** Clicks Edit in a row's menu. The harness would wait for the reload this triggers. */
  async function clickEdit(element: HTMLElement, name: string) {
    (
      element.querySelector(`[aria-label="More for ${name}"]`) as HTMLElement
    ).click();
    await vi.waitFor(() =>
      expect(document.querySelector('.mat-mdc-menu-item')).not.toBeNull(),
    );
    (document.querySelector('.mat-mdc-menu-item') as HTMLElement).click();
  }

  it('refreshes who is signed in after the admin edits their own row', async () => {
    const { element } = await render({ ...boss, displayName: 'Boss B' });

    await clickEdit(element, 'BOSS');

    await vi.waitFor(() => http.expectOne('/api/users').flush([boss, anna]));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not refresh the session after editing someone else', async () => {
    const { element } = await render({ ...anna, displayName: 'Anna B' });

    await clickEdit(element, 'ANNA');

    await vi.waitFor(() => http.expectOne('/api/users').flush([boss, anna]));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('adds a user through the dialog and reloads the list', async () => {
    const { fixture, element } = await render(anna);

    (
      [...element.querySelectorAll('button')].find((b) =>
        b.textContent?.includes('Add user'),
      ) as HTMLButtonElement
    ).click();

    expect(open).toHaveBeenCalled();
    await vi.waitFor(() => http.expectOne('/api/users').flush([boss, anna]));
    await fixture.whenStable();
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Added ANNA' }),
    );
  });

  it('offers every action for someone else, but not delete or demote for yourself', async () => {
    const { menu } = await render();

    const mine = await menu('BOSS');
    await mine.open();
    expect(
      await Promise.all((await mine.getItems()).map((i) => i.getText())),
    ).toEqual(['Edit']);
    await mine.close();

    const theirs = await menu('ANNA');
    await theirs.open();
    expect(
      await Promise.all((await theirs.getItems()).map((i) => i.getText())),
    ).toEqual(['Edit', 'Reset password', 'Make admin', 'Delete']);
  });

  it('grants admin and reloads', async () => {
    const { fixture, menu } = await render();
    const theirs = await menu('ANNA');

    await theirs.clickItem({ text: 'Make admin' });
    const call = http.expectOne('/api/users/2');
    expect(call.request.method).toBe('PATCH');
    expect(call.request.body).toEqual({ isAdmin: true });
    call.flush({ ...anna, isAdmin: true });
    await vi.waitFor(() => http.expectOne('/api/users').flush([boss, anna]));
    await fixture.whenStable();

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'ANNA is now an admin' }),
    );
  });

  it("shows the server's refusal, e.g. when the last admin would be demoted", async () => {
    const { menu } = await render();
    const theirs = await menu('ANNA');
    await theirs.clickItem({ text: 'Make admin' });

    http
      .expectOne('/api/users/2')
      .flush(
        { message: 'The last admin cannot be demoted' },
        { status: 409, statusText: 'Conflict' },
      );

    await vi.waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'The last admin cannot be demoted',
        }),
      ),
    );
  });

  it('deletes a user only after confirming, then reloads', async () => {
    const { fixture, menu } = await render(true);
    const theirs = await menu('ANNA');

    await theirs.clickItem({ text: 'Delete' });
    expect(open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: expect.objectContaining({ heading: 'Delete ANNA?' }),
      }),
    );
    http.expectOne('/api/users/2').flush(null, { status: 204, statusText: '' });
    await vi.waitFor(() => http.expectOne('/api/users').flush([boss]));
    await fixture.whenStable();

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Deleted ANNA' }),
    );
  });

  it('does not delete when the confirmation is declined', async () => {
    const { menu } = await render(undefined);
    const theirs = await menu('ANNA');

    await theirs.clickItem({ text: 'Delete' });

    expect(open).toHaveBeenCalled();
    // http.verify() in afterEach fails on any DELETE
  });

  it('says the users could not be loaded, and tries again', async () => {
    open = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: MatDialog, useValue: { open } },
        { provide: Notifier, useValue: { notify: vi.fn() } },
        { provide: AuthSession, useValue: { user: signal(boss) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(UsersPage);
    fixture.detectChanges();
    http.expectOne('/api/users').error(new ProgressEvent('error'));
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'could not be loaded',
    );

    (element.querySelector('p button') as HTMLButtonElement).click();
    await vi.waitFor(() => http.expectOne('/api/users').flush([boss]));
    await fixture.whenStable();

    expect(element.querySelectorAll('li.user').length).toBe(1);
  });
});
