import { expect, test } from './support/fixtures';
import {
  addItem,
  createList,
  editItemTitle,
  includeList,
  itemMenu,
  itemTitles,
  openList,
  otherDevice,
  pasteItems,
  section,
  synced,
  syncStatus,
} from './support/app';

test.describe('real-time sync between two devices', () => {
  test('items added, edited, reordered and deleted in A show up in B without a reload', async ({
    page: a,
    browser,
  }) => {
    const title = await createList(a);
    const b = await otherDevice(browser);
    await openList(a, title);
    await openList(b, title);

    await test.step('add', async () => {
      await addItem(a, 'Tent');
      await pasteItems(a, ['Stove', 'Matches']);
      await expect(itemTitles(b)).toHaveText(['Tent', 'Stove', 'Matches']);
    });

    await test.step('edit', async () => {
      await editItemTitle(a, 'Stove', 'Gas stove');
      await expect(itemTitles(b)).toHaveText(['Tent', 'Gas stove', 'Matches']);
    });

    await test.step('reorder', async () => {
      await itemMenu(a, 'Matches', 'Move up');
      await expect(itemTitles(b)).toHaveText(['Tent', 'Matches', 'Gas stove']);
    });

    await test.step('delete', async () => {
      await itemMenu(a, 'Tent', 'Delete');
      await expect(itemTitles(b)).toHaveText(['Matches', 'Gas stove']);
    });

    await test.step('and back: B changes, A sees it', async () => {
      await addItem(b, 'Lamp');
      await expect(itemTitles(a)).toHaveText(['Matches', 'Gas stove', 'Lamp']);
    });
    await b.context().close();
  });
});

test.describe('an item deleted while someone edits it', () => {
  test('the open edit dialog says it was deleted and can restore it', async ({
    page: a,
    browser,
  }) => {
    const title = await createList(a);
    const b = await otherDevice(browser);
    await openList(a, title);
    await addItem(a, 'Tent');
    await openList(b, title);
    await expect(itemTitles(b)).toHaveText(['Tent']);

    await itemMenu(a, 'Tent', 'Edit');
    const dialog = a.getByRole('dialog');
    await itemMenu(b, 'Tent', 'Delete');

    await expect(dialog.getByRole('alert')).toContainText('Deleted by');
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Restore' }).click();

    await expect(dialog).toBeHidden();
    await expect(itemTitles(a)).toHaveText(['Tent']);
    await expect(itemTitles(b)).toHaveText(['Tent']);
    await b.context().close();
  });
});

test.describe('offline', () => {
  test('A changes items offline while B changes others; both converge once A is back', async ({
    page: a,
    context,
    browser,
  }) => {
    const title = await createList(a);
    await openList(a, title);
    await pasteItems(a, ['Tent', 'Stove', 'Matches', 'Lamp']);
    await synced(a);
    const b = await otherDevice(browser);
    await openList(b, title);
    await expect(itemTitles(b)).toHaveText([
      'Tent',
      'Stove',
      'Matches',
      'Lamp',
    ]);

    await context.setOffline(true);
    await expect(syncStatus(a)).toContainText('Offline');

    await test.step('A, offline: add, edit and delete', async () => {
      await addItem(a, 'Rope');
      await editItemTitle(a, 'Tent', 'Big tent');
      await itemMenu(a, 'Matches', 'Delete');
      await expect(itemTitles(a)).toHaveText([
        'Big tent',
        'Stove',
        'Lamp',
        'Rope',
      ]);
      await expect(syncStatus(a)).toContainText('3 changes not synced');
    });

    await test.step('B, online: changes other items', async () => {
      await editItemTitle(b, 'Stove', 'Gas stove');
      // Past items A keeps, so the result shows whether the move survived.
      await itemMenu(b, 'Lamp', 'Move up');
      await itemMenu(b, 'Lamp', 'Move up');
      await addItem(b, 'Map');
      await expect(itemTitles(b)).toHaveText([
        'Tent',
        'Lamp',
        'Gas stove',
        'Matches',
        'Map',
      ]);
    });

    await context.setOffline(false);
    await synced(a);

    // Per-field merge: A's edit and delete, B's edit and move. Rope and Map were both appended
    // at the end concurrently, so their order is a tie broken by id; it only has to be the same
    // on both devices.
    const contents = (page: typeof a) => itemTitles(page).allTextContents();
    await expect
      .poll(async () => [...(await contents(a))].sort())
      .toEqual(['Big tent', 'Gas stove', 'Lamp', 'Map', 'Rope']);
    for (const page of [a, b]) {
      await expect
        .poll(async () => (await contents(page)).slice(0, 3))
        .toEqual(['Big tent', 'Lamp', 'Gas stove']);
    }
    await expect
      .poll(async () => (await contents(b)).join('|'))
      .toBe((await contents(a)).join('|'));
    await b.context().close();
  });
});

test.describe('a loop made on two devices', () => {
  test('the half that arrives second is rolled back with a notice', async ({
    page: a,
    context,
    browser,
  }) => {
    const x = await createList(a);
    const y = await createList(a);
    await synced(a);
    const b = await otherDevice(browser);

    await openList(a, x);
    await context.setOffline(true);
    await expect(syncStatus(a)).toContainText('Offline');
    await includeList(a, y); // A, offline: X includes Y

    await openList(b, y);
    await includeList(b, x); // B, online: Y includes X — reaches the server first
    await synced(b);

    await context.setOffline(false);
    await expect(
      a.getByText(
        `Change not saved: That would make a loop: “${y}” already contains “${x}”`,
      ),
    ).toBeVisible();
    await expect(section(a, y)).toBeHidden();
    await synced(a);
    await b.context().close();
  });
});
