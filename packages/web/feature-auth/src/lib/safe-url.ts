/** Where to go after signing in: only a path inside the app, never another site. */
export function safeReturnUrl(url: string | undefined): string {
  return url &&
    url.startsWith('/') &&
    !url.startsWith('//') &&
    !url.startsWith('/\\')
    ? url
    : '/';
}
