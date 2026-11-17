import { DOCUMENT } from '@angular/common';
import { Service, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  type CompositionSource,
  type List,
  newId,
} from '@lister/shared/domain';
import {
  MAX_IMPORT_BYTES,
  buildListExport,
  exportFileName,
  importArgs,
  listToMarkdown,
  parseImportFile,
} from '@lister/shared/list-transfer';
import { MAX_DUPLICATE_ROWS } from '@lister/shared/sync-protocol';
import { SpaceChanges } from '@lister/web/data-access-sync';
import { NOTICE_DURATION_MS, Notifier } from '@lister/web/util-notify';

/** What a file picker hands over (a `File`). */
export type PickedFile = Pick<File, 'name' | 'size' | 'text'>;

/**
 * Export, import and print of lists (D24). Exports are built from the rows the caller reads
 * from the local database, so they work offline; imports are sync-engine mutations, so they
 * work offline too and reach the other devices.
 */
@Service()
export class Transfers {
  private readonly document = inject(DOCUMENT);
  private readonly changes = inject(SpaceChanges);
  private readonly notifier = inject(Notifier);
  private readonly router = inject(Router);

  /** Downloads one list (with the lists it includes) as Markdown or Lister JSON. */
  exportList(
    list: List,
    format: 'markdown' | 'json',
    source: CompositionSource,
  ): void {
    if (format === 'markdown') {
      this.download(
        exportFileName(list.title, 'md'),
        listToMarkdown(list.id, source),
        'text/markdown',
      );
      return;
    }
    this.download(
      exportFileName(list.title, 'json'),
      json(buildListExport([list.id], source)),
      'application/json',
    );
  }

  /** Downloads every given list, with the lists they include, as one Lister JSON file. */
  exportAll(lists: readonly List[], source: CompositionSource): void {
    const day = new Date().toISOString().slice(0, 10);
    this.download(
      exportFileName(`Lister lists ${day}`, 'json'),
      json(
        buildListExport(
          lists.map((list) => list.id),
          source,
        ),
      ),
      'application/json',
    );
  }

  /**
   * Imports a picked file into the current space: Markdown or text as one new list, a Lister
   * JSON export as new copies of its lists. Anything wrong is told and nothing is created.
   */
  async importFile(file: PickedFile): Promise<void> {
    if (file.size > MAX_IMPORT_BYTES) {
      this.changes.tell('This file is too big to import');
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      this.changes.tell("Couldn't read this file");
      return;
    }
    const parsed = parseImportFile(file.name, text);
    if (parsed.kind === 'error') {
      this.changes.tell(parsed.message);
      return;
    }
    if (parsed.kind === 'lists') {
      const args = importArgs(parsed.file);
      if (!(await this.changes.apply({ name: 'list.import', args }))) return;
      const count = args.lists.length;
      this.changes.tell(
        count === 1 ? 'Imported 1 list' : `Imported ${count} lists`,
      );
      return;
    }
    if (parsed.items.length > MAX_DUPLICATE_ROWS) {
      this.changes.tell(
        `This file has too many lines: at most ${MAX_DUPLICATE_ROWS} items`,
      );
      return;
    }
    const id = newId();
    const created = await this.changes.apply({
      name: 'list.create',
      args: {
        id,
        title: parsed.title,
        items: parsed.items.map((title) => ({ id: newId(), title })),
      },
    });
    if (!created) return;
    const outcome = await this.notifier.notify({
      message: `Imported “${parsed.title}”`,
      action: 'Open',
      duration: NOTICE_DURATION_MS,
    });
    if (outcome === 'action') await this.router.navigate(['/lists', id]);
  }

  /** Prints the current page; the print stylesheet (styles.scss) leaves out the chrome. */
  print(): void {
    this.document.defaultView?.print();
  }

  private download(name: string, content: string, type: string): void {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = this.document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
