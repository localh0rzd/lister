import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { UserSuggestion } from '@lister/shared/api-contracts';
import { SpacesApi } from '../spaces/spaces-api';
import { AddMemberDialog, SUGGEST_DEBOUNCE_MS } from './add-member-dialog';

const ben: UserSuggestion = { id: 'u2', username: 'ben', displayName: 'Ben B' };

async function render() {
  const close = vi.fn();
  const api = {
    searchUsers: vi.fn(async (): Promise<UserSuggestion[]> => [ben]),
    addMember: vi.fn(async () => ({})),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: { spaceId: 's1' } },
      { provide: MatDialogRef, useValue: { close } },
      { provide: SpacesApi, useValue: api },
    ],
  });
  const fixture = TestBed.createComponent(AddMemberDialog);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const input = element.querySelector('input') as HTMLInputElement;
  const type = async (text: string) => {
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  const submit = async () => {
    element.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  };
  return { fixture, element, input, type, submit, api, close };
}

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('AddMemberDialog', () => {
  it('asks for suggestions once typing pauses, from 2 characters', async () => {
    const dialog = await render();

    await dialog.type('b');
    await new Promise((done) => setTimeout(done, SUGGEST_DEBOUNCE_MS + 50));
    expect(dialog.api.searchUsers).not.toHaveBeenCalled();

    await dialog.type('be');
    await dialog.type('ben');

    await vi.waitFor(() => expect(dialog.api.searchUsers).toHaveBeenCalled());
    expect(dialog.api.searchUsers).toHaveBeenCalledTimes(1);
    expect(dialog.api.searchUsers).toHaveBeenCalledWith('ben', 's1');
  });

  it('keeps showing the suggestions when a later search fails, and drops them when the text is short', async () => {
    const dialog = await render();
    const suggestions = () =>
      (
        dialog.fixture.componentInstance as unknown as {
          suggestions: () => UserSuggestion[];
        }
      ).suggestions();
    await dialog.type('be');
    await vi.waitFor(() => expect(suggestions()).toEqual([ben]));

    dialog.api.searchUsers.mockRejectedValueOnce(new Error('offline'));
    await dialog.type('ben');
    await vi.waitFor(() =>
      expect(dialog.api.searchUsers).toHaveBeenCalledTimes(2),
    );
    expect(suggestions()).toEqual([ben]);

    await dialog.type('b');
    await vi.waitFor(() => expect(suggestions()).toEqual([]));
  });

  it('adds whatever username is typed, trimmed, then closes', async () => {
    const dialog = await render();

    await dialog.type('  hidden.user ');
    await dialog.submit();

    await vi.waitFor(() => expect(dialog.close).toHaveBeenCalledWith(true));
    expect(dialog.api.addMember).toHaveBeenCalledWith('s1', {
      username: 'hidden.user',
    });
  });

  it('shows a failure in the dialog and stays open', async () => {
    const dialog = await render();
    dialog.api.addMember.mockRejectedValueOnce(new Error('nope'));

    await dialog.type('nobody');
    await dialog.submit();

    await vi.waitFor(() =>
      expect(dialog.element.querySelector('[role="alert"]')).not.toBeNull(),
    );
    expect(dialog.close).not.toHaveBeenCalled();
  });

  it('asks for a username when empty', async () => {
    const dialog = await render();

    await dialog.submit();
    dialog.fixture.detectChanges();

    expect(dialog.api.addMember).not.toHaveBeenCalled();
    expect(dialog.element.textContent).toContain('Enter a username');
  });
});
