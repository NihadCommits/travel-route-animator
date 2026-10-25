/**
 * Where to insert an item dropped before or after the item at `targetIndex`, once it has been
 * taken out of the same list at `from` (null if it comes from another list).
 */
export function insertIndex(
  targetIndex: number,
  position: 'before' | 'after',
  from: number | null,
): number {
  const index = targetIndex + (position === 'after' ? 1 : 0);
  return from !== null && from < index ? index - 1 : index;
}
