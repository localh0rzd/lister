import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import type { SpaceSummary } from '@lister/shared/api-contracts';
import { newId } from '@lister/shared/domain';
import { makeSpaceMember, makeSpaceSummary } from '@lister/shared/testing';
import { AuthSession } from '@lister/web/data-access-auth';
import {
  CURRENT_SPACE_KEY,
  LOCAL_DB,
  LocalDb,
} from '@lister/web/data-access-local-db';
import { Notifier } from '@lister/web/util-notify';
import type { FieldDialogData } from '../field-dialog/field-dialog';
import { SpacesSection } from './spaces-section';

const ME = newId();
const BEN = newId();
const summary = (
  name: string,
  changes: Partial<SpaceSummary> = {},
): SpaceSummary =>
  makeSpaceSummary({
    name,
    personal: false,
    role: 'owner',
    members: [
      makeSpaceMember({ userId: ME, displayName: 'Anna', role: 'owner' }),
      makeSpaceMember({ userId: BEN, displayName: 'Ben', role: 'member' }),
    ],
    ...changes,
  });

let db: LocalDb;
let http: HttpTestingController;
let open: ReturnType<typeof vi.fn>;
let notify: ReturnType<typeof vi.fn>;

async function render(
  spaces: SpaceSummary[],
  dialogResult: unknown = true,
  answer = true,
) {
  localStorage.removeItem(CURRENT_SPACE_KEY);
  db = new LocalDb(`test-${newId()}`);
  await db.spaces.bulkPut(
    spaces.map((s) => ({
      id: s.id,
      name: s.name,
      version: 1,
      members: s.members.map(({ userId, displayName }) => ({
        userId,
        displayName,
      })),
    })),
  );
  open = vi.fn(() => ({ afterClosed: () => of(dialogResult) }));
  notify = vi.fn(async () => 'dismissed');
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: LOCAL_DB, useValue: db },
      { provide: MatDialog, useValue: { open } },
      { provide: Notifier, useValue: { notify } },
      { provide: AuthSession, useValue: { user: signal({ id: ME }) } },
    ],
  });
  http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(SpacesSection);
  fixture.detectChanges();
  if (answer) http.expectOne('/api/spaces').flush(spaces);
  const element = fixture.nativeElement as HTMLElement;
  await vi.waitFor(async () => {
    // A pending request keeps the fixture from ever being stable.
    if (answer) await fixture.whenStable();
    else fixture.detectChanges();
    expect(element.querySelectorAll('.space').length).toBe(spaces.length);
  });
  const button = (name: string) =>
    [...element.querySelectorAll('button')].find((b) =>
      b.textContent?.includes(name),
    ) as HTMLButtonElement | undefined;
  return { fixture, element, button };
}

afterEach(async () => {
  http.verify();
  TestBed.resetTestingModule();
  await db.delete();
});

describe('SpacesSection', () => {
  it('switches the space the app works in, and marks the current one', async () => {
    const home = summary('Home', { personal: true });
    const trip = summary('Trip');
    const { fixture, element } = await render([home, trip]);
    const spaces = () => [...element.querySelectorAll<HTMLElement>('.space')];
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(spaces()[0].getAttribute('aria-current')).toBe('true');
    });

    spaces()[1].click();
    await fixture.whenStable();

    expect(spaces()[1].getAttribute('aria-current')).toBe('true');
    expect(spaces()[0].getAttribute('aria-current')).toBeNull();
    expect(localStorage.getItem(CURRENT_SPACE_KEY)).toBe(trip.id);
  });

  it('gives the owner of a shared space every management action', async () => {
    const { element, button } = await render([summary('Trip')]);

    expect(element.textContent).toContain('Members of Trip');
    expect(element.textContent).toContain('Ben');
    expect(button('Rename')).toBeTruthy();
    expect(button('Add member')).toBeTruthy();
    expect(button('Delete space')).toBeTruthy();
    expect(button('Remove')?.textContent).toContain('Ben');
    expect(button('Leave space')).toBeUndefined();
  });

  it('lets a member only leave', async () => {
    const { button } = await render([summary('Trip', { role: 'member' })]);

    expect(button('Leave space')).toBeTruthy();
    expect(button('Rename')).toBeUndefined();
    expect(button('Add member')).toBeUndefined();
    expect(button('Remove')).toBeUndefined();
  });

  it('only lets people rename their personal space', async () => {
    const { button } = await render([summary('Home', { personal: true })]);

    expect(button('Rename')).toBeTruthy();
    expect(button('Add member')).toBeUndefined();
    expect(button('Delete space')).toBeUndefined();
    expect(button('Leave space')).toBeUndefined();
  });

  it('creates a space, switching to it, then reloads', async () => {
    const trip = summary('Trip');
    const { button } = await render([summary('Home', { personal: true })]);

    button('New space')?.click();
    const data = open.mock.calls[0][1].data as FieldDialogData;
    expect(data.heading).toBe('New space');
    const done = data.submit('Trip');
    const call = http.expectOne('/api/spaces');
    expect(call.request.body).toEqual({ name: 'Trip' });
    call.flush(trip);
    await done;

    expect(localStorage.getItem(CURRENT_SPACE_KEY)).toBe(trip.id);
    await vi.waitFor(() => http.expectOne('/api/spaces').flush([trip]));
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Space created' }),
    );
  });

  it('renames a space through the field dialog', async () => {
    const trip = summary('Trip');
    const { button } = await render([trip]);

    button('Rename')?.click();
    const rename = open.mock.calls[0][1].data as FieldDialogData;
    expect(rename.value).toBe('Trip');
    const renamed = rename.submit('Holiday');
    const patch = http.expectOne(`/api/spaces/${trip.id}`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ name: 'Holiday' });
    patch.flush({ ...trip, name: 'Holiday' });
    await renamed;
    await vi.waitFor(() => http.expectOne('/api/spaces').flush([trip]));
  });

  it('opens the add-member dialog for the space, then refreshes and says so', async () => {
    const trip = summary('Trip');
    const { button } = await render([trip]);

    button('Add member')?.click();

    expect(open.mock.calls[0][1].data).toEqual({ spaceId: trip.id });
    await vi.waitFor(() => http.expectOne('/api/spaces').flush([trip]));
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Member added' }),
    );
  });

  it('removes a member after confirming', async () => {
    const trip = summary('Trip');
    const { button } = await render([trip]);

    button('Remove')?.click();
    expect(open.mock.calls[0][1].data.heading).toBe('Remove Ben?');
    const call = http.expectOne(`/api/spaces/${trip.id}/members/${BEN}`);
    expect(call.request.method).toBe('DELETE');
    call.flush(null, { status: 204, statusText: '' });
    await vi.waitFor(() => http.expectOne('/api/spaces').flush([trip]));
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Ben removed' }),
    );
  });

  it('leaves a space after confirming, and deletes one only with a confirmation', async () => {
    const trip = summary('Trip', { role: 'member' });
    const { button } = await render([trip]);

    button('Leave space')?.click();
    expect(open.mock.calls[0][1].data.heading).toBe('Leave “Trip”?');
    expect(open.mock.calls[0][1].data.message).toContain(
      'Changes to it that have not synced yet are lost.',
    );
    http
      .expectOne(`/api/spaces/${trip.id}/leave`)
      .flush(null, { status: 204, statusText: '' });
    await vi.waitFor(() => http.expectOne('/api/spaces').flush([]));
  });

  it('does nothing when a confirmation is declined', async () => {
    const trip = summary('Trip');
    const { button } = await render([trip], false);

    button('Delete space')?.click();

    expect(open).toHaveBeenCalled();
    // http.verify() fails on any request
  });

  it("shows the server's refusal as a notice", async () => {
    const trip = summary('Trip');
    const { button } = await render([trip]);

    button('Delete space')?.click();
    expect(open.mock.calls[0][1].data.message).toContain(
      'have not synced yet are lost',
    );
    http
      .expectOne(`/api/spaces/${trip.id}`)
      .flush(
        { message: 'Only the owner can do that' },
        { status: 403, statusText: '' },
      );

    await vi.waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Only the owner can do that' }),
      ),
    );
  });

  describe('while the members load', () => {
    it('keeps the members place with a labelled spinner, after a short delay, then shows the members', async () => {
      const trip = summary('Trip');
      const { fixture, element } = await render([trip], true, false);
      const spinner = () =>
        element.querySelector('lister-loading-spinner mat-progress-spinner');
      const box = element.querySelector<HTMLElement>(
        '.details lister-loading-spinner',
      );

      // The name and the room for two members are known from the device at once.
      expect(element.textContent).toContain('Members of Trip');
      expect(box?.style.height).toBe('112px');
      expect(element.querySelector('.member')).toBeNull();
      expect(spinner()).toBeNull();

      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(spinner()?.getAttribute('aria-label')).toBe('Loading members');
      });

      http.expectOne('/api/spaces').flush([trip]);
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(element.querySelectorAll('.member').length).toBe(2);
      });
      expect(
        element.querySelector('.details lister-loading-spinner'),
      ).toBeNull();
    });

    it('shows the existing error text, not a spinner, when the request fails', async () => {
      const { fixture, element } = await render([summary('Trip')], true, false);

      http
        .expectOne('/api/spaces')
        .flush(null, { status: 500, statusText: 'Server Error' });
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(element.textContent).toContain(
          'Members and sharing need a connection to the server.',
        );
      });
      expect(
        element.querySelector('.details lister-loading-spinner'),
      ).toBeNull();
      expect(element.querySelector('.actions')).toBeNull();
    });

    it('asks the server again once when its answer lacks the current space', async () => {
      const trip = summary('Trip');
      const { fixture, element } = await render([trip], true, false);

      // The space reached this device after the server answered.
      http.expectOne('/api/spaces').flush([]);
      await vi.waitFor(() => {
        fixture.detectChanges();
        http.expectOne('/api/spaces').flush([trip]);
      });

      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(element.querySelectorAll('.member').length).toBe(2);
      });
    });

    it('stops the spinner and offers Try again when the server still lacks the current space', async () => {
      const { fixture, element } = await render([summary('Trip')], true, false);

      http.expectOne('/api/spaces').flush([]);
      await vi.waitFor(() => {
        fixture.detectChanges();
        http.expectOne('/api/spaces').flush([]);
      });

      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(element.textContent).toContain(
          "The server doesn't list this space's members yet.",
        );
      });
      expect(
        element.querySelector('.details lister-loading-spinner'),
      ).toBeNull();
      // Asked once more, not in a loop (afterEach verifies no request is left).
    });

    it('keeps showing the members while they are refreshed', async () => {
      const trip = summary('Trip');
      const { fixture, element } = await render([trip]);

      fixture.componentInstance['summaries'].reload();
      fixture.detectChanges();

      expect(element.querySelectorAll('.member').length).toBe(2);
      expect(element.querySelector('lister-loading-spinner')).toBeNull();
      http.expectOne('/api/spaces').flush([trip]);
    });
  });
});
