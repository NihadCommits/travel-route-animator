import type { Id, Project } from '@travel-route-animator/core';

/** A row the tree currently shows, in display order. */
export interface VisibleRow {
  id: Id;
  parentId: Id | null;
  /** Undefined for leaves (tracks). */
  expanded?: boolean;
}

export type NavigationKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End';

const NAVIGATION_KEYS = new Set<string>([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
] satisfies NavigationKey[]);

export const isNavigationKey = (key: string): key is NavigationKey => NAVIGATION_KEYS.has(key);

export type Navigation = { focus: Id } | { toggle: Id; open: boolean };

/** The rows in display order; children of collapsed items are not shown. */
export function visibleRows(project: Project, collapsed: ReadonlySet<Id>): VisibleRow[] {
  const rows: VisibleRow[] = [];
  for (const group of project.groups) {
    const groupOpen = !collapsed.has(group.id);
    rows.push({ id: group.id, parentId: null, expanded: groupOpen });
    if (!groupOpen) continue;
    for (const etappe of group.etappen) {
      const etappeOpen = !collapsed.has(etappe.id);
      rows.push({ id: etappe.id, parentId: group.id, expanded: etappeOpen });
      if (!etappeOpen) continue;
      for (const track of etappe.tracks) rows.push({ id: track.id, parentId: etappe.id });
    }
  }
  return rows;
}

/**
 * What a navigation key does on the row `currentId`, following the WAI-ARIA tree pattern:
 * up/down step through the visible rows, right opens an item and then steps into it, left
 * closes it and then steps out to its parent.
 */
export function navigate(
  rows: readonly VisibleRow[],
  currentId: Id,
  key: NavigationKey,
): Navigation | null {
  const index = rows.findIndex((row) => row.id === currentId);
  const row = rows[index];
  if (!row) return null;
  const focus = (target: VisibleRow | undefined) => (target ? { focus: target.id } : null);

  switch (key) {
    case 'ArrowDown':
      return focus(rows[index + 1]);
    case 'ArrowUp':
      return focus(rows[index - 1]);
    case 'Home':
      return focus(rows[0]);
    case 'End':
      return focus(rows.at(-1));
    case 'ArrowRight': {
      if (row.expanded === false) return { toggle: row.id, open: true };
      const next = rows[index + 1];
      return row.expanded && next?.parentId === row.id ? focus(next) : null;
    }
    case 'ArrowLeft':
      if (row.expanded) return { toggle: row.id, open: false };
      return row.parentId === null ? null : { focus: row.parentId };
  }
}
