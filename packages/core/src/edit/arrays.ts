// Small immutable array helpers shared by the editing operations.

export function replaceAt<T>(items: readonly T[], index: number, item: T): T[] {
  return items.map((existing, i) => (i === index ? item : existing));
}

/** Inserts at `index`, clamped to the array, so positions beyond the end mean "append". */
export function insertAt<T>(items: readonly T[], index: number, item: T): T[] {
  const at = Math.max(0, Math.min(index, items.length));
  return [...items.slice(0, at), item, ...items.slice(at)];
}

export function removeAt<T>(items: readonly T[], index: number): T[] {
  return items.filter((_, i) => i !== index);
}
