/** Field limits, checked by the mutation schemas on client and server alike. */
export const LIMITS = {
  title: 200,
  description: 2000,
  quantity: 50,
  note: 2000,
  spaceName: 100,
} as const;

/** How long deleted lists and items stay in the trash before they're purged (D15). */
export const TRASH_KEEP_DAYS = 30;
export const TRASH_KEEP_MS = TRASH_KEEP_DAYS * 24 * 60 * 60 * 1000;
