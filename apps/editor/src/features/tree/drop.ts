import {
  locateItem,
  moveEtappe,
  moveGroup,
  moveTrack,
  type Id,
  type Project,
} from '@travel-route-animator/core';

export type TreeItemKind = 'group' | 'etappe' | 'track';

/** Where a dragged item lands relative to the row it is dropped on. */
export type DropPosition = 'before' | 'after' | 'inside';

export interface DropTarget {
  id: Id;
  position: DropPosition;
}

/** Which kinds a row of each kind accepts. Tracks only move within their own stage. */
export const ACCEPTS: Record<TreeItemKind, readonly TreeItemKind[]> = {
  group: ['group', 'etappe'],
  etappe: ['etappe'],
  track: ['track'],
};

/**
 * Turns the pointer position over a row into a drop position. `relativeY` is 0 at the top of
 * the row and 1 at the bottom. A stage dropped on a group goes into it; everything else is
 * placed before or after a sibling.
 */
export function dropPositionFor(
  dragged: TreeItemKind,
  target: TreeItemKind,
  relativeY: number,
): DropPosition | null {
  if (!ACCEPTS[target].includes(dragged)) return null;
  if (dragged === 'etappe' && target === 'group') return 'inside';
  return relativeY < 0.5 ? 'before' : 'after';
}

/** Index to insert at after the item at `from` has been taken out of the same list. */
function insertIndex(targetIndex: number, position: DropPosition, from: number | null): number {
  const index = targetIndex + (position === 'after' ? 1 : 0);
  return from !== null && from < index ? index - 1 : index;
}

/**
 * The edit a drop stands for, or undefined if it would change nothing or is not allowed.
 * Pure, so the drag & drop rules are tested without a browser.
 */
export function resolveDrop(
  project: Project,
  draggedId: Id,
  target: DropTarget,
): ((project: Project) => Project) | undefined {
  if (draggedId === target.id) return undefined;
  const from = locateItem(project, draggedId);
  const to = locateItem(project, target.id);
  if (!from || !to) return undefined;

  if (from.kind === 'group' && to.kind === 'group' && target.position !== 'inside') {
    const index = insertIndex(to.groupIndex, target.position, from.groupIndex);
    if (index === from.groupIndex) return undefined;
    return (p) => moveGroup(p, draggedId, index);
  }

  if (from.kind === 'etappe' && to.kind === 'group' && target.position === 'inside') {
    const group = project.groups[to.groupIndex]!;
    const sameGroup = from.groupIndex === to.groupIndex;
    const index = sameGroup ? group.etappen.length - 1 : group.etappen.length;
    if (sameGroup && index === from.etappeIndex) return undefined;
    return (p) => moveEtappe(p, draggedId, group.id, index);
  }

  if (from.kind === 'etappe' && to.kind === 'etappe' && target.position !== 'inside') {
    const groupId = project.groups[to.groupIndex]!.id;
    const sameGroup = from.groupIndex === to.groupIndex;
    const index = insertIndex(to.etappeIndex, target.position, sameGroup ? from.etappeIndex : null);
    if (sameGroup && index === from.etappeIndex) return undefined;
    return (p) => moveEtappe(p, draggedId, groupId, index);
  }

  if (
    from.kind === 'track' &&
    to.kind === 'track' &&
    target.position !== 'inside' &&
    from.groupIndex === to.groupIndex &&
    from.etappeIndex === to.etappeIndex
  ) {
    const index = insertIndex(to.trackIndex, target.position, from.trackIndex);
    if (index === from.trackIndex) return undefined;
    return (p) => moveTrack(p, draggedId, index);
  }

  return undefined;
}
