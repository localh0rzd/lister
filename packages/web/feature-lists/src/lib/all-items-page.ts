import { Component, computed, inject } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { CurrentSpace, Repositories } from '@lister/web/data-access-local-db';
import { LoadingHint } from '@lister/web/ui';

/**
 * "All items" (D21): every item of the current space's lists, A–Z, identical items as one row,
 * each with links to the lists that contain it. Read-only, from the local database.
 */
@Component({
  selector: 'lister-all-items-page',
  imports: [LoadingHint, MatIcon, RouterLink],
  templateUrl: './all-items-page.html',
  styleUrl: './all-items-page.scss',
})
export class AllItemsPage {
  private readonly space = inject(CurrentSpace);
  private readonly index = inject(Repositories).itemIndexOfSpace(this.space.id);

  protected readonly view = computed(() => {
    const space = this.space.state();
    if (space.status === 'loading') return { kind: 'loading' as const };
    if (space.status === 'error') return { kind: 'error' as const };
    if (!space.value) return { kind: 'no-space' as const };
    const index = this.index();
    if (index.status === 'error') return { kind: 'error' as const };
    if (index.status === 'loading') return { kind: 'loading' as const };
    return { kind: 'items' as const, rows: index.value };
  });
}
