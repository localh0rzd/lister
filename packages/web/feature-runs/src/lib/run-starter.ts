import { Service, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  type CompositionSource,
  type List,
  newId,
  runItemsFromList,
} from '@lister/shared/domain';
import { SpaceChanges } from '@lister/web/data-access-sync';
import { runTitle } from './run-sections';

/** Starts runs and opens them; used by the Lists pages ("Start run") and the Runs page. */
@Service()
export class RunStarter {
  private readonly changes = inject(SpaceChanges);
  private readonly router = inject(Router);

  /**
   * "Start run" on a list: copies its items, included lists' too, into a new run (D2), titled
   * with the list's name and today's date, then opens it. Works offline: the ids come from here.
   */
  async fromList(list: List, source: CompositionSource): Promise<void> {
    await this.start(
      runTitle(list.title),
      list.id,
      runItemsFromList(list.id, source, newId),
    );
  }

  /** "New run": an empty ad-hoc run (R8). */
  async adHoc(title: string): Promise<void> {
    await this.start(title, null, []);
  }

  private async start(
    title: string,
    sourceListId: string | null,
    items: ReturnType<typeof runItemsFromList>,
  ): Promise<void> {
    const id = newId();
    const started = await this.changes.apply({
      name: 'run.start',
      args: { id, title, sourceListId, items },
    });
    if (started) await this.router.navigate(['/runs', id]);
  }
}
