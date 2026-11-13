/**
 * Pages shown without the app's navigation and without sync notices: nobody can go anywhere else
 * before they are signed in.
 */
export const BARE_PATHS = ['/sign-in', '/setup', '/change-password'] as const;

/** Whether `url` (with or without query or fragment) is one of the bare pages. */
export function isBarePath(url: string): boolean {
  return (BARE_PATHS as readonly string[]).includes(url.split(/[?#]/)[0]);
}
