import { Component, computed, inject } from '@angular/core';
import { MatFabButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { CurrentSpace, Repositories } from '@lister/web/data-access-local-db';
import { LoadingHint, TitleDialog, type TitleDialogData } from '@lister/web/ui';
import { firstValueFrom } from 'rxjs';
import { progressText, runTitle } from './run-sections';
import { RunStarter } from './run-starter';

/**
 * The Runs destination: the space's active runs with their progress, newest first. Finished
 * runs are only in the trash (D10). "New run" starts an empty ad-hoc run (R8).
 */
@Component({
  selector: 'lister-runs-page',
  imports: [LoadingHint, MatFabButton, MatIcon, MatProgressBar, RouterLink],
  templateUrl: './runs-page.html',
  styleUrl: './runs-page.scss',
})
export class RunsPage {
  private readonly space = inject(CurrentSpace);
  private readonly repositories = inject(Repositories);
  private readonly dialog = inject(MatDialog);
  private readonly starter = inject(RunStarter);

  private readonly runs = this.repositories.activeRunsOfSpace(this.space.id);

  protected readonly view = computed(() => {
    const space = this.space.state();
    if (space.status === 'loading') return { kind: 'loading' as const };
    if (space.status === 'error') return { kind: 'error' as const };
    if (!space.value) return { kind: 'no-space' as const };
    const runs = this.runs();
    if (runs.status === 'error') return { kind: 'error' as const };
    if (runs.status === 'loading') return { kind: 'loading' as const };
    return {
      kind: 'runs' as const,
      runs: runs.value.map((summary) => ({
        ...summary,
        text: progressText(summary),
        percent:
          summary.total === 0
            ? 0
            : Math.round((summary.done / summary.total) * 100),
      })),
    };
  });

  protected async create(): Promise<void> {
    const ref = this.dialog.open<TitleDialog, TitleDialogData, string>(
      TitleDialog,
      {
        data: { heading: 'New run', confirm: 'Start', title: runTitle(null) },
        autoFocus: 'first-tabbable',
      },
    );
    const title = await firstValueFrom(ref.afterClosed());
    if (title) await this.starter.adHoc(title);
  }
}
