import { Component, computed, input, model, output } from '@angular/core';
import {
  MatAutocomplete,
  MatAutocompleteTrigger,
  MatOption,
  type MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { suggestTitles } from '@lister/shared/domain';

/**
 * The "Add item" text field with title suggestions (D22). It shows the `titles` that match what
 * is typed, leaving out the `exclude`d ones. Choosing one emits `chosen`; Enter with nothing
 * chosen submits the enclosing form as usual, and Escape just closes the suggestions.
 */
@Component({
  selector: 'lister-add-item-field',
  imports: [
    MatAutocomplete,
    MatAutocompleteTrigger,
    MatFormField,
    MatInput,
    MatLabel,
    MatOption,
  ],
  templateUrl: './add-item-field.html',
  styleUrl: './add-item-field.scss',
})
export class AddItemField {
  /** What is typed. */
  readonly value = model('');
  /** Titles to suggest from. */
  readonly titles = input<readonly string[]>([]);
  /** Titles the list or run already holds. */
  readonly exclude = input<readonly string[]>([]);
  /** A suggestion was chosen: add an item with this title. */
  readonly chosen = output<string>();
  /** The user pasted into the field. */
  readonly pasted = output<ClipboardEvent>();

  protected readonly suggestions = computed(() =>
    suggestTitles(this.titles(), this.value(), this.exclude()),
  );

  protected typed(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value);
  }

  protected choose(event: MatAutocompleteSelectedEvent): void {
    const title: string = event.option.value;
    this.value.set(title);
    this.chosen.emit(title);
  }
}
