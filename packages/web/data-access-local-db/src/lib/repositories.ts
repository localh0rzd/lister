import { Service, type Signal, inject } from '@angular/core';
import { type Item, type List, sortByPosition } from '@lister/shared/domain';
import { LOCAL_DB } from './local-db';
import { liveQuerySignal } from './live-query-signal';

const byTitle = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/**
 * Read-only queries on the local database, as signals. Changes go through the sync engine's
 * mutations (`@lister/web/data-access-sync`), never through these tables directly.
 * Call the methods in an injection context (field initializers).
 */
@Service()
export class Repositories {
  private readonly db = inject(LOCAL_DB);

  /** The lists of a space, by title (design §3), without deleted ones. */
  listsOfSpace(spaceId: () => string | undefined): Signal<List[] | undefined> {
    return liveQuerySignal(() => {
      const id = spaceId();
      if (!id) return undefined;
      return async () =>
        (await this.db.lists.where('spaceId').equals(id).toArray())
          .filter((list) => list.deletedAt === null)
          .sort(
            (a, b) =>
              byTitle.compare(a.title, b.title) || (a.id < b.id ? -1 : 1),
          );
    });
  }

  /** The items of a list, by position, without deleted ones. */
  itemsOfList(listId: () => string | undefined): Signal<Item[] | undefined> {
    return liveQuerySignal(() => {
      const id = listId();
      if (!id) return undefined;
      return async () =>
        sortByPosition(
          (await this.db.items.where('listId').equals(id).toArray()).filter(
            (item) => item.deletedAt === null,
          ),
        );
    });
  }
}
