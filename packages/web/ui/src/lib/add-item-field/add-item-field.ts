import {
  Component,
  type ElementRef,
  afterRenderEffect,
  computed,
  input,
  model,
  output,
  viewChild,
} from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
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
 * chosen submits the enclosing form as usual, and Escape just closes the suggestions. Bind it
 * with `[formField]` like an input.
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
export class AddItemField implements FormValueControl<string> {
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

  private readonly trigger = viewChild.required(MatAutocompleteTrigger);
  private readonly field =
    viewChild.required<ElementRef<HTMLInputElement>>('field');

  constructor() {
    // A value set from outside (the page empties the field after adding) goes through the
    // trigger, so it forgets the last chosen title; otherwise entering that title again would
    // open no suggestions.
    afterRenderEffect(() => {
      const value = this.value();
      if (this.field().nativeElement.value !== value) {
        this.trigger().writeValue(value);
      }
    });
  }

  protected typed(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value);
  }

  protected choose(event: MatAutocompleteSelectedEvent): void {
    const title: string = event.option.value;
    this.value.set(title);
    this.chosen.emit(title);
  }
}
