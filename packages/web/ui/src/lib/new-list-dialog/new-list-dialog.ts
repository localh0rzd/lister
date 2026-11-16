import { Component, inject, signal } from '@angular/core';
import {
  FormField,
  form,
  submit,
  validate,
  validateStandardSchema,
} from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import {
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import {
  MatError,
  MatFormField,
  MatHint,
  MatLabel,
} from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { cleanItemLines } from '@lister/shared/domain';
import { MAX_DUPLICATE_ROWS, titleSchema } from '@lister/shared/sync-protocol';

/** What the dialog closes with: the trimmed title and the cleaned-up item titles (D18). */
export interface NewListResult {
  title: string;
  items: string[];
}

/**
 * Asks for a new list's title and, optionally, its items pasted one per line. The lines are
 * cleaned up by `cleanItemLines` (D18) and checked with the same title rules and item limit as
 * the server, so a bad paste is refused here with a message, not by the server.
 */
@Component({
  selector: 'lister-new-list-dialog',
  imports: [
    FormField,
    MatButton,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatError,
    MatFormField,
    MatHint,
    MatInput,
    MatLabel,
  ],
  templateUrl: './new-list-dialog.html',
  styleUrl: './new-list-dialog.scss',
})
export class NewListDialog {
  private readonly dialog =
    inject<MatDialogRef<NewListDialog, NewListResult>>(MatDialogRef);

  private readonly model = signal({ title: '', items: '' });
  protected readonly listForm = form(this.model, (path) => {
    validateStandardSchema(path.title, titleSchema);
    validate(path.items, ({ value }) => {
      const lines = cleanItemLines(value());
      if (lines.length > MAX_DUPLICATE_ROWS) {
        return {
          kind: 'tooMany',
          message: `At most ${MAX_DUPLICATE_ROWS} items (you pasted ${lines.length})`,
        };
      }
      for (const [index, line] of lines.entries()) {
        const issue = titleSchema.safeParse(line).error?.issues[0];
        if (issue) {
          return {
            kind: 'badLine',
            message: `Item ${index + 1} (“${line.slice(0, 30)}”): ${issue.message}`,
          };
        }
      }
      return undefined;
    });
  });

  /** `submit` marks every field touched and runs the action only when the form is valid. */
  protected save(event: Event): void {
    event.preventDefault();
    void submit(this.listForm, async () => {
      const { title, items } = this.model();
      this.dialog.close({ title: title.trim(), items: cleanItemLines(items) });
    });
  }
}
