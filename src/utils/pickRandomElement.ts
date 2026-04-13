/**
 * Returns a random element from `items`, or `null` if `items` is missing, not an array, or empty.
 */
export function pickRandomElement<T>(items: T[] | null | undefined): T | null {
  if (items == null || !Array.isArray(items) || items.length === 0) {
    return null;
  }
  const index = Math.floor(Math.random() * items.length);
  return items[index] as T;
}
