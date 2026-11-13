import {
  createAccount,
  signInThroughTheUi,
  signedOutPage,
} from './support/accounts';
import { createList, unique } from './support/app';
import { expect, test } from './support/fixtures';

const layouts = [
  ['a phone (375 px)', { width: 375, height: 812 }],
  ['a desktop (1280 px)', { width: 1280, height: 800 }],
] as const;

for (const [name, viewport] of layouts) {
  test.describe(`spaces on ${name}`, () => {
    test.use({ viewport });

    test('create a shared space, add and remove a member, switch spaces, leave and delete', async ({
      browser,
      expectAccessible,
    }) => {
      test.setTimeout(120_000);
      const anna = await createAccount('anna');
      const ben = await createAccount('ben');
      const space = unique('Trip');
      const annaPage = await signedOutPage(browser);
      const benPage = await signedOutPage(browser);
      await signInThroughTheUi(annaPage, anna);
      await signInThroughTheUi(benPage, ben);
      const switcher = (page: typeof annaPage) =>
        page.getByRole('list', { name: 'Switch space' });
      const spaceRow = (page: typeof annaPage) =>
        switcher(page).getByRole('button', { name: new RegExp(space) });

      await test.step('creating a space switches to it', async () => {
        await annaPage.goto('/space');
        await expect(switcher(annaPage).getByRole('button')).toHaveCount(1);
        await annaPage.getByRole('button', { name: 'New space' }).click();
        const dialog = annaPage.getByRole('dialog', { name: 'New space' });
        await dialog.getByLabel('Name').fill(space);
        await dialog.getByRole('button', { name: 'Create' }).click();
        await expect(dialog).toBeHidden();
        await expect(spaceRow(annaPage)).toHaveAttribute(
          'aria-current',
          'true',
        );
        await expect(annaPage.getByText(`Members of ${space}`)).toBeVisible();
        await expectAccessible(annaPage);
      });

      await test.step('lists belong to the space they were made in', async () => {
        const title = await createList(annaPage, unique('Shared'));
        await annaPage.goto('/space');
        await switcher(annaPage)
          .getByRole('button')
          .filter({ hasNotText: space })
          .click();
        await annaPage.goto('/lists');
        await expect(annaPage.getByRole('link', { name: title })).toHaveCount(
          0,
        );
        await annaPage.goto('/space');
        await spaceRow(annaPage).click();
        await annaPage.goto('/lists');
        await expect(annaPage.getByRole('link', { name: title })).toBeVisible();
        await annaPage.goto('/space');
      });

      await test.step('adding a member shares the space with them', async () => {
        await annaPage.getByRole('button', { name: 'Add member' }).click();
        const dialog = annaPage.getByRole('dialog', { name: 'Add a member' });
        await dialog.getByLabel('Username').fill('nobody-by-that-name');
        await dialog.getByRole('button', { name: 'Add' }).click();
        await expect(dialog.getByRole('alert')).toBeVisible(); // stays open and explains
        await dialog.getByLabel('Username').fill(ben.username);
        await dialog.getByRole('button', { name: 'Add' }).click();
        await expect(dialog).toBeHidden();
        await expect(
          annaPage.getByRole('list', { name: 'Members' }),
        ).toContainText(ben.displayName);

        await benPage.goto('/space');
        await expect(spaceRow(benPage)).toBeVisible();
        await spaceRow(benPage).click();
        await expect(
          benPage.getByRole('list', { name: 'Members' }),
        ).toContainText(anna.displayName);
        await expect(
          benPage.getByRole('button', { name: 'Leave space' }),
        ).toBeVisible();
        await expect(
          benPage.getByRole('button', { name: 'Add member' }),
        ).toHaveCount(0);
        await expectAccessible(benPage);
      });

      await test.step('renaming', async () => {
        await annaPage.getByRole('button', { name: 'Rename' }).click();
        const dialog = annaPage.getByRole('dialog', { name: 'Rename space' });
        await dialog.getByLabel('Name').fill(`${space} renamed`);
        await dialog.getByRole('button', { name: 'Rename' }).click();
        await expect(
          annaPage.getByText(`Members of ${space} renamed`),
        ).toBeVisible();
      });

      await test.step('removing a member takes the space away from them', async () => {
        await annaPage
          .getByRole('button', {
            name: new RegExp(`Remove.*${ben.displayName}`),
          })
          .click();
        await annaPage
          .getByRole('dialog')
          .getByRole('button', { name: 'Remove' })
          .click();
        await expect(
          annaPage.getByRole('list', { name: 'Members' }),
        ).not.toContainText(ben.displayName);
        await benPage.reload();
        await expect(spaceRow(benPage)).toHaveCount(0);
      });

      await test.step('a member can leave', async () => {
        await annaPage.getByRole('button', { name: 'Add member' }).click();
        const dialog = annaPage.getByRole('dialog', { name: 'Add a member' });
        await dialog.getByLabel('Username').fill(ben.username);
        await dialog.getByRole('button', { name: 'Add' }).click();
        await expect(dialog).toBeHidden();
        await benPage.reload();
        await benPage
          .getByRole('list', { name: 'Switch space' })
          .getByRole('button', { name: new RegExp(space) })
          .click();
        await benPage.getByRole('button', { name: 'Leave space' }).click();
        await benPage
          .getByRole('dialog')
          .getByRole('button', { name: 'Leave' })
          .click();
        await expect(
          benPage
            .getByRole('list', { name: 'Switch space' })
            .getByRole('button', { name: new RegExp(space) }),
        ).toHaveCount(0);
        await annaPage.reload();
        await expect(
          annaPage.getByRole('list', { name: 'Members' }),
        ).not.toContainText(ben.displayName);
      });

      await test.step('the owner deletes the space', async () => {
        await annaPage.getByRole('button', { name: 'Delete space' }).click();
        await annaPage
          .getByRole('dialog')
          .getByRole('button', { name: 'Delete' })
          .click();
        await expect(spaceRow(annaPage)).toHaveCount(0);
      });

      await annaPage.context().close();
      await benPage.context().close();
    });
  });
}
