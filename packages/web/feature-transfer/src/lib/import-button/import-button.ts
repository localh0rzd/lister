import { Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { Transfers } from '../transfers';

/** "Import": picks a Markdown, text or Lister JSON file and imports it as new lists (D24). */
@Component({
  selector: 'lister-import-button',
  imports: [MatButton, MatIcon],
  templateUrl: './import-button.html',
})
export class ImportButton {
  private readonly transfers = inject(Transfers);

  protected async picked(input: HTMLInputElement): Promise<void> {
    const file = input.files?.item(0);
    // Reset first, so picking the same file again still fires `change`.
    input.value = '';
    if (file) await this.transfers.importFile(file);
  }
}
