/** D6: quantity is optional free text; empty means 1. */
export function normalizeQuantity(quantity: string): string {
  return quantity.trim();
}

/** What to show: the quantity, or "1" when it's empty. */
export function displayQuantity(quantity: string): string {
  return normalizeQuantity(quantity) || '1';
}
