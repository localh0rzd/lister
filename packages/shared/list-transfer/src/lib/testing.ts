import {
  type CompositionSource,
  type Include,
  type IncludeException,
  type Item,
  type List,
  newId,
} from '@lister/shared/domain';
import {
  makeInclude,
  makeIncludeException,
  makeItem,
  makeList,
} from '@lister/shared/testing';

/** A small in-memory space for the export specs. Positions are the order given. */
export class FakeSpace implements CompositionSource {
  readonly lists = new Map<string, List>();
  readonly items: Item[] = [];
  readonly includes: Include[] = [];
  readonly exceptions: IncludeException[] = [];

  addList(title: string, description = '', deleted = false): string {
    const id = newId();
    this.lists.set(
      id,
      makeList({ id, title, description, deletedAt: deleted ? 1 : null }),
    );
    return id;
  }

  addItem(listId: string, title: string, quantity = '', note = ''): string {
    const id = newId();
    this.items.push(
      makeItem({
        id,
        listId,
        title,
        quantity,
        note,
        position: this.nextPosition(listId),
      }),
    );
    return id;
  }

  addInclude(parentListId: string, childListId: string): string {
    const id = newId();
    this.includes.push(
      makeInclude({
        id,
        parentListId,
        childListId,
        position: this.nextPosition(parentListId),
      }),
    );
    return id;
  }

  /** Leaves the item or list out of the include (D28). */
  addException(
    includeId: string,
    targetKind: 'item' | 'list',
    targetId: string,
    deleted = false,
  ): void {
    this.exceptions.push(
      makeIncludeException({
        includeId,
        targetKind,
        targetId,
        deletedAt: deleted ? 5 : null,
      }),
    );
  }

  /** Moves the item with this title to the trash. */
  trashItem(title: string): void {
    const index = this.items.findIndex((item) => item.title === title);
    this.items[index] = { ...this.items[index], deletedAt: 5 };
  }

  list = (id: string) => this.lists.get(id);
  itemsOf = (listId: string) => this.items.filter((i) => i.listId === listId);
  exceptionsOf = (includeId: string) =>
    this.exceptions.filter((e) => e.includeId === includeId);
  includesOf = (listId: string) =>
    this.includes.filter((i) => i.parentListId === listId);

  private nextPosition(listId: string): string {
    const n = this.itemsOf(listId).length + this.includesOf(listId).length;
    return String.fromCharCode(97 + n); // 'a', 'b', ... sorts in order
  }
}
