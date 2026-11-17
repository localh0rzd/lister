import { Component, input } from '@angular/core';
import type { Id } from '@lister/shared/domain';

/** An item of a print sheet; `state` is set for a run's items, so the check state is printed. */
export interface PrintItem {
  readonly id: Id;
  readonly title: string;
  readonly quantity: string;
  readonly note: string;
  readonly state?: 'unchecked' | 'checked' | 'skipped';
}

/** Items under an optional heading (an included list, or a run's section). */
export interface PrintGroup {
  readonly key: string;
  readonly title: string | null;
  readonly items: readonly PrintItem[];
}

/**
 * What is printed of a list or a run (D24): the title and every item, grouped by list. It is
 * hidden on screen; the print stylesheet (styles.scss) shows it and hides the rest of the page.
 */
@Component({
  selector: 'lister-print-sheet',
  templateUrl: './print-sheet.html',
  styleUrl: './print-sheet.scss',
})
export class PrintSheet {
  readonly title = input.required<string>();
  readonly groups = input.required<readonly PrintGroup[]>();

  protected mark(state: PrintItem['state']): string {
    return state === 'checked' ? '☑' : state === 'skipped' ? '⊘' : '☐';
  }
}
