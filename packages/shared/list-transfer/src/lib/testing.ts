import {
  type CompositionSource,
  type Include,
  type Item,
  type List,
  newId,
} from '@lister/shared/domain';

const meta = {
  spaceId: 's',
  version: 1,
  deletedAt: null,
  createdBy: 'u',
  updatedBy: 'u',
  createdAt: 0,
  updatedAt: 0,
};

/** A small in-memory space for the export specs. Positions are the order given. */
export class FakeSpace implements CompositionSource {
  readonly lists = new Map<string, List>();
  readonly items: Item[] = [];
  readonly includes: Include[] = [];

  addList(title: string, description = '', deleted = false): string {
    const id = newId();
    this.lists.set(id, {
      ...meta,
      id,
      title,
      description,
      colour: null,
      icon: null,
      deletedAt: deleted ? 1 : null,
    });
    return id;
  }

  addItem(listId: string, title: string, quantity = '', note = ''): void {
    this.items.push({
      ...meta,
      id: newId(),
      listId,
      title,
      quantity,
      note,
      position: this.nextPosition(listId),
    });
  }

  addInclude(parentListId: string, childListId: string): void {
    this.includes.push({
      ...meta,
      id: newId(),
      parentListId,
      childListId,
      position: this.nextPosition(parentListId),
    });
  }

  /** Moves the item with this title to the trash. */
  trashItem(title: string): void {
    const index = this.items.findIndex((item) => item.title === title);
    this.items[index] = { ...this.items[index], deletedAt: 5 };
  }

  list = (id: string) => this.lists.get(id);
  itemsOf = (listId: string) => this.items.filter((i) => i.listId === listId);
  includesOf = (listId: string) =>
    this.includes.filter((i) => i.parentListId === listId);

  private nextPosition(listId: string): string {
    const n = this.itemsOf(listId).length + this.includesOf(listId).length;
    return String.fromCharCode(97 + n); // 'a', 'b', ... sorts in order
  }
}
