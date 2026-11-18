import { Component, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  MatAutocomplete,
  MatAutocompleteTrigger,
  MatOption,
} from '@angular/material/autocomplete';
import { MatButton } from '@angular/material/button';
import {
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
  MAT_DIALOG_DATA,
} from '@angular/material/dialog';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import {
  EMPTY,
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  from,
  map,
  merge,
  switchMap,
} from 'rxjs';
import {
  AUTH_LIMITS,
  USER_SEARCH,
  type UserSuggestion,
} from '@lister/shared/api-contracts';
import { describeAuthError } from '@lister/web/data-access-auth';
import { SpacesApi } from '../spaces/spaces-api';

export interface AddMemberDialogData {
  spaceId: string;
}

/** Wait this long after the last key before asking the server for suggestions. */
export const SUGGEST_DEBOUNCE_MS = 250;

/**
 * "Add a member": a username field that suggests users who made themselves visible (D27). The
 * field always accepts an exact username too, and the dialog never says whether one exists
 * before Add is pressed. Closes with `true` once the member is added.
 */
@Component({
  selector: 'lister-add-member-dialog',
  imports: [
    MatAutocomplete,
    MatAutocompleteTrigger,
    MatButton,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatFormField,
    MatHint,
    MatInput,
    MatLabel,
    MatOption,
  ],
  templateUrl: './add-member-dialog.html',
  styleUrl: './add-member-dialog.scss',
})
export class AddMemberDialog {
  private readonly data = inject<AddMemberDialogData>(MAT_DIALOG_DATA);
  private readonly api = inject(SpacesApi);
  private readonly dialog =
    inject<MatDialogRef<AddMemberDialog, true>>(MatDialogRef);

  protected readonly maxLength = AUTH_LIMITS.usernameMax;
  protected readonly text = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly touched = signal(false);

  /**
   * Suggestions for the text. A new search keeps the previous results until its own arrive, so
   * the list doesn't flicker while typing; they go when the text is too short. A failed search
   * (offline, rate-limited) keeps what is shown: typing the username still works.
   */
  protected readonly suggestions = toSignal(
    (() => {
      const typed$ = toObservable(this.text).pipe(
        map((text) => text.trim()),
        debounceTime(SUGGEST_DEBOUNCE_MS),
        distinctUntilChanged(),
      );
      return merge(
        typed$.pipe(
          filter((text) => text.length < USER_SEARCH.minLength),
          map((): UserSuggestion[] => []),
        ),
        typed$.pipe(
          filter((text) => text.length >= USER_SEARCH.minLength),
          switchMap((text) =>
            from(this.api.searchUsers(text, this.data.spaceId)).pipe(
              catchError(() => EMPTY),
            ),
          ),
        ),
      );
    })(),
    { initialValue: [] as UserSuggestion[] },
  );

  protected onInput(event: Event): void {
    this.text.set((event.target as HTMLInputElement).value);
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    this.touched.set(true);
    const username = this.text().trim();
    if (!username) return;
    this.error.set('');
    this.busy.set(true);
    try {
      await this.api.addMember(this.data.spaceId, { username });
      this.dialog.close(true);
    } catch (error) {
      this.error.set(describeAuthError(error));
    } finally {
      this.busy.set(false);
    }
  }
}
