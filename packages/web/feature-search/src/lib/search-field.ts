import {
  Component,
  type ElementRef,
  afterNextRender,
  afterRenderEffect,
  computed,
  Injector,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  MatAutocomplete,
  MatAutocompleteTrigger,
  MatOptgroup,
  MatOption,
  type MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatFormField, MatPrefix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { Router } from '@angular/router';
import { search } from '@lister/shared/domain';
import {
  CurrentSpace,
  Repositories,
  valueOf,
} from '@lister/web/data-access-local-db';

/**
 * The search field of the app bar (D25): finds lists, items (with their list) and active runs of
 * the current space as you type, from the local database, grouped. Choosing a result opens its
 * page. `/` focuses the field from anywhere outside a text field, arrows and Enter choose, and
 * Escape clears it.
 */
@Component({
  selector: 'lister-search-field',
  imports: [
    MatAutocomplete,
    MatAutocompleteTrigger,
    MatFormField,
    MatIcon,
    MatInput,
    MatOptgroup,
    MatOption,
    MatPrefix,
  ],
  templateUrl: './search-field.html',
  styleUrl: './search-field.scss',
  host: { role: 'search', '(document:keydown)': 'focusOnSlash($event)' },
})
export class SearchField {
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
  private readonly space = inject(CurrentSpace);
  private readonly text = signal('');
  /**
   * The space to search, only while something is typed. A `computed`, so further typing (which
   * keeps the value) does not restart the live query.
   */
  private readonly searchedSpace = computed(() =>
    this.text().trim() ? this.space.id() : undefined,
  );
  private readonly data = inject(Repositories).searchDataOfSpace(
    this.searchedSpace,
  );
  private readonly trigger = viewChild.required(MatAutocompleteTrigger);
  private readonly field =
    viewChild.required<ElementRef<HTMLInputElement>>('field');

  protected readonly results = computed(() => {
    const data = valueOf(this.data());
    return data ? search(data, this.text()) : undefined;
  });
  /** Typed text that nothing matches (not while the database is still answering). */
  protected readonly nothing = computed(() => {
    const found = this.results();
    return (
      !!found &&
      found.lists.length + found.items.length + found.runs.length === 0
    );
  });

  constructor() {
    // Clearing from here (Escape, a chosen result) goes through the trigger, which would else
    // keep what was chosen as its value.
    afterRenderEffect(() => {
      if (this.text() === '' && this.field().nativeElement.value !== '') {
        this.trigger().writeValue('');
      }
    });
  }

  protected typed(event: Event): void {
    this.text.set((event.target as HTMLInputElement).value);
  }

  protected clear(): void {
    this.text.set('');
  }

  protected open(event: MatAutocompleteSelectedEvent): void {
    const link: string[] = event.option.value;
    this.text.set('');
    // Leave the keyboard of a phone behind: the chosen page is what the user wants to see.
    // Material puts the focus back on the input right after this event, so let go afterwards.
    afterNextRender(() => this.field().nativeElement.blur(), {
      injector: this.injector,
    });
    void this.router.navigate(link);
  }

  protected focusOnSlash(event: KeyboardEvent): void {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
    ) {
      return;
    }
    event.preventDefault();
    this.field().nativeElement.focus();
  }
}
