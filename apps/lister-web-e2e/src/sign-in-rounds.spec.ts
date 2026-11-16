import { test } from './support/fixtures';
import { signInRounds } from './support/sign-in-rounds';

test('five sign-out and sign-in rounds leave the app synced', async ({
  browser,
}) => {
  await signInRounds(browser);
});
