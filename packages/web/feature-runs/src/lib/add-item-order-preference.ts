import { Service, signal } from '@angular/core';
import type { AddItemOrder } from '@lister/web/ui';

const KEY = 'lister.addItemOrder';

/**
 * Where a new item goes when it is typed into a list or a run (D17): "end" (the default) or
 * "sorted" (before the first item that sorts after it). Remembered on this device.
 */
@Service()
export class AddItemOrderPreference {
  readonly order = signal<AddItemOrder>(read());

  set(order: AddItemOrder): void {
    this.order.set(order);
    try {
      localStorage.setItem(KEY, order);
    } catch {
      // Storage blocked: it holds for this visit only.
    }
  }
}

function read(): AddItemOrder {
  try {
    return localStorage.getItem(KEY) === 'sorted' ? 'sorted' : 'end';
  } catch {
    return 'end';
  }
}
