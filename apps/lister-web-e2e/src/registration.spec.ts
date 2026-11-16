import type { Page } from '@playwright/test';
import { signedOutPage, uniqueUsername } from './support/accounts';
import { expect, test } from './support/fixtures';

/** Clicks "Create link" and returns the new token, from the response: other tests create links too. */
async function createLink(page: Page): Promise<string> {
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/registration-tokens') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Create link' }).click();
  const body = (await (await created).json()) as { token: string };
  return body.token;
}

const layouts = [
  ['a phone (375 px)', { width: 375, height: 812 }],
  ['a desktop (1280 px)', { width: 1280, height: 800 }],
] as const;

for (const [name, viewport] of layouts) {
  test.describe(`registration links on ${name}`, () => {
    test.use({ viewport });

    test('an admin creates a link and copies it; someone registers with it and lands in the app as a regular user', async ({
      page,
      browser,
      expectAccessible,
    }) => {
      test.setTimeout(60_000);
      await page
        .context()
        .grantPermissions(['clipboard-read', 'clipboard-write']);
      const username = uniqueUsername('invited');
      const links = page.getByRole('list', { name: 'Registration links' });
      let link = '';
      let token = '';

      await test.step('the admin creates a link under Settings › Users', async () => {
        await page.goto('/settings/users');
        await expect(
          page.getByRole('heading', { level: 2, name: 'Registration links' }),
        ).toBeVisible();
        token = await createLink(page);
        const mine = links.getByRole('listitem').filter({ hasText: token });
        await expect(mine).toContainText('/register?token=');
        link = await mine.locator('.url').innerText();
        expect(link).toMatch(new RegExp(`/register\\?token=${token}$`));
        await expect(mine).toContainText('Expires');
        await expectAccessible();
      });

      await test.step('copying puts the link on the clipboard and says so', async () => {
        await page.getByRole('button', { name: `Copy link ${token}` }).click();
        await expect(page.getByText('Link copied')).toBeVisible();
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
          link,
        );
      });

      const guest = await signedOutPage(browser);
      await test.step('the link opens the registration page with the token filled in', async () => {
        const target = new URL(link);
        await guest.goto(target.pathname + target.search);
        await expect(
          guest.getByRole('heading', { name: 'Create your account' }),
        ).toBeVisible();
        await expect(guest.getByLabel('Registration token')).toHaveValue(token);
        await expect(
          guest.getByRole('navigation', { name: 'Main' }),
        ).toHaveCount(0);
        await expectAccessible(guest);
      });

      await test.step('registering signs them in to the app, as a regular user', async () => {
        await guest.getByLabel('Username').fill(username);
        await guest.getByLabel('Display name').fill(`Invited ${username}`);
        await guest.getByLabel('Password').fill('a-long-test-password');
        await guest.getByRole('button', { name: 'Create account' }).click();
        await expect(guest).toHaveURL(/\/lists$/);
        await guest.goto('/settings/users');
        await expect(guest).toHaveURL(/\/settings$/); // not an admin
        await guest.context().close();
      });

      await test.step('the token is gone from the admin’s list, and the link no longer works', async () => {
        await page.reload();
        await expect(
          page.getByRole('heading', { level: 2, name: 'Registration links' }),
        ).toBeVisible();
        await expect(
          page.getByRole('button', { name: `Copy link ${token}` }),
        ).toHaveCount(0);
        const again = await signedOutPage(browser);
        await again.goto(`/register?token=${token}`);
        await again.getByLabel('Username').fill(`${username}-2`);
        await again.getByLabel('Display name').fill('Second');
        await again.getByLabel('Password').fill('a-long-test-password');
        await again.getByRole('button', { name: 'Create account' }).click();
        await expect(again.getByRole('alert')).toContainText('not valid');
        await again.context().close();
      });
    });

    test('an admin removes a link, and it stops working', async ({
      page,
      browser,
    }) => {
      await page.goto('/settings/users');
      const token = await createLink(page);
      await expect(
        page.getByRole('button', { name: `Remove link ${token}` }),
      ).toBeVisible();

      await page.getByRole('button', { name: `Remove link ${token}` }).click();
      await expect(page.getByText('Link removed')).toBeVisible();
      await expect(
        page.getByRole('button', { name: `Remove link ${token}` }),
      ).toHaveCount(0);

      const guest = await signedOutPage(browser);
      await guest.goto(`/register?token=${token}`);
      await guest.getByLabel('Username').fill(uniqueUsername('removed'));
      await guest.getByLabel('Display name').fill('Nobody');
      await guest.getByLabel('Password').fill('a-long-test-password');
      await guest.getByRole('button', { name: 'Create account' }).click();
      await expect(guest.getByRole('alert')).toContainText('not valid');
      await guest.context().close();
    });
  });
}
