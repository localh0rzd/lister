/** Field limits, checked by the mutation schemas on client and server alike. */
export const LIMITS = {
  title: 200,
  description: 2000,
  quantity: 50,
  note: 2000,
  spaceName: 100,
} as const;
