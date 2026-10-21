import type { Id } from '../model/primitives';
import type { Project } from '../model/project';

export type ItemKind = 'project' | 'group' | 'etappe' | 'track';

/** Where an item sits in the tree. Indices are positions in the respective arrays. */
export type ItemLocation =
  | { kind: 'project' }
  | { kind: 'group'; groupIndex: number }
  | { kind: 'etappe'; groupIndex: number; etappeIndex: number }
  | { kind: 'track'; groupIndex: number; etappeIndex: number; trackIndex: number };

/** Finds any item by its ID. IDs are unique across the project, so the kind follows from it. */
export function locateItem(project: Project, id: Id): ItemLocation | undefined {
  if (project.id === id) return { kind: 'project' };
  for (const [groupIndex, group] of project.groups.entries()) {
    if (group.id === id) return { kind: 'group', groupIndex };
    for (const [etappeIndex, etappe] of group.etappen.entries()) {
      if (etappe.id === id) return { kind: 'etappe', groupIndex, etappeIndex };
      const trackIndex = etappe.tracks.findIndex((track) => track.id === id);
      if (trackIndex !== -1) return { kind: 'track', groupIndex, etappeIndex, trackIndex };
    }
  }
  return undefined;
}

export function requireLocation<K extends ItemKind>(
  project: Project,
  id: Id,
  kind: K,
): Extract<ItemLocation, { kind: K }> {
  const location = locateItem(project, id);
  if (location?.kind !== kind) {
    throw new Error(`No ${kind} with ID "${id}" in project "${project.name}"`);
  }
  return location as Extract<ItemLocation, { kind: K }>;
}
