/**
 * "Anna · 14:02": who did something and when. Today shows the time only; another day adds the
 * date ("Anna · 3 Nov, 14:02"). `who` is a display name, "Someone" when the person is no longer
 * a member of the space.
 */
export function attribution(
  who: string | undefined,
  at: number,
  now: number = Date.now(),
  locale?: string,
): string {
  const when = new Date(at);
  const time = when.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
  const sameDay = when.toDateString() === new Date(now).toDateString();
  const text = sameDay
    ? time
    : `${when.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}, ${time}`;
  return `${who ?? 'Someone'} · ${text}`;
}
