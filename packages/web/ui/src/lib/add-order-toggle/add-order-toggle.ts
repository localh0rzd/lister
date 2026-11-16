import { Component, model } from '@angular/core';
import {
  MatButtonToggle,
  MatButtonToggleGroup,
} from '@angular/material/button-toggle';

/** Where a new item goes: at the end, or sorted in before the first one that sorts after it (D17). */
export type AddItemOrder = 'end' | 'sorted';

/** The "Add at end" / "Sort in" choice next to an add-item field. */
@Component({
  selector: 'lister-add-order-toggle',
  imports: [MatButtonToggleGroup, MatButtonToggle],
  templateUrl: './add-order-toggle.html',
})
export class AddOrderToggle {
  readonly value = model.required<AddItemOrder>();
}
