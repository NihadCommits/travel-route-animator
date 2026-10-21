import type { VehicleType } from '../model/enums';
import type { Etappe } from '../model/etappe';
import {
  createEtappe,
  createGroup,
  createTrack,
  defaultFactoryContext,
  type FactoryContext,
} from '../model/factories';
import type { Id } from '../model/primitives';
import type { Group, Project } from '../model/project';
import type { Track } from '../model/track';
import { recommendViewMode } from '../model/vehicles';
import { defaultView } from '../model/defaults';
import { locateItem, requireLocation, type ItemLocation } from './locate';

// Every operation returns a new project and leaves the input untouched. Unchanged groups,
// stages and tracks keep their identity, so React only re-renders what really changed, and
// undo is simply "go back to the previous object".
//
// The result may be unfinished (a stage without vehicles, a track without waypoints); that is
// allowed while editing (ADR 0002).

export interface Added {
  project: Project;
  /** ID of the new item, so the editor can select it right away. */
  id: Id;
}

// ---------- small immutable array helpers ----------

function replaceAt<T>(items: readonly T[], index: number, item: T): T[] {
  return items.map((existing, i) => (i === index ? item : existing));
}

function insertAt<T>(items: readonly T[], index: number, item: T): T[] {
  const at = Math.max(0, Math.min(index, items.length));
  return [...items.slice(0, at), item, ...items.slice(at)];
}

function removeAt<T>(items: readonly T[], index: number): T[] {
  return items.filter((_, i) => i !== index);
}

function updateGroup(project: Project, groupIndex: number, update: (g: Group) => Group): Project {
  const group = project.groups[groupIndex]!;
  return { ...project, groups: replaceAt(project.groups, groupIndex, update(group)) };
}

function updateEtappe(
  project: Project,
  groupIndex: number,
  etappeIndex: number,
  update: (e: Etappe) => Etappe,
): Project {
  return updateGroup(project, groupIndex, (group) => ({
    ...group,
    etappen: replaceAt(group.etappen, etappeIndex, update(group.etappen[etappeIndex]!)),
  }));
}

// ---------- add ----------

export function addGroup(
  project: Project,
  name: string,
  ctx: FactoryContext = defaultFactoryContext,
  index = project.groups.length,
): Added {
  const group = createGroup(name, ctx);
  return { project: { ...project, groups: insertAt(project.groups, index, group) }, id: group.id };
}

/** A new stage starts without vehicles; the first vehicle added decides its view. */
export function addEtappe(
  project: Project,
  groupId: Id,
  name: string,
  ctx: FactoryContext = defaultFactoryContext,
): Added {
  const { groupIndex } = requireLocation(project, groupId, 'group');
  const etappe = createEtappe({ name, tracks: [] }, ctx);
  return {
    project: updateGroup(project, groupIndex, (group) => ({
      ...group,
      etappen: [...group.etappen, etappe],
    })),
    id: etappe.id,
  };
}

/**
 * Adds a vehicle to a stage. The first vehicle sets the stage's view to the one recommended
 * for it (a plane switches to the globe) and becomes the camera target.
 */
export function addTrack(
  project: Project,
  etappeId: Id,
  vehicleType: VehicleType,
  { label, ctx = defaultFactoryContext }: { label?: string; ctx?: FactoryContext } = {},
): Added {
  const { groupIndex, etappeIndex } = requireLocation(project, etappeId, 'etappe');
  const etappe = project.groups[groupIndex]!.etappen[etappeIndex]!;
  const track = createTrack(
    { vehicleType, colorIndex: etappe.tracks.length, ...(label !== undefined && { label }) },
    ctx,
  );

  const updated = updateEtappe(project, groupIndex, etappeIndex, (current) => {
    const tracks = [...current.tracks, track];
    if (current.tracks.length > 0) return { ...current, tracks };
    const camera = { ...current.view.camera, mode: 'follow' as const, followTrackId: track.id };
    return { ...current, tracks, view: defaultView(recommendViewMode([vehicleType]), camera) };
  });
  return { project: updated, id: track.id };
}

// ---------- rename ----------

/** Renames the project, a group or a stage; for a track it sets the label. */
export function renameItem(project: Project, id: Id, name: string): Project {
  if (project.id === id) return { ...project, name };
  const location = locateOrThrow(project, id);
  switch (location.kind) {
    case 'group':
      return updateGroup(project, location.groupIndex, (group) => ({ ...group, name }));
    case 'etappe':
      return updateEtappe(project, location.groupIndex, location.etappeIndex, (etappe) => ({
        ...etappe,
        name,
      }));
    case 'track':
      return updateEtappe(project, location.groupIndex, location.etappeIndex, (etappe) => ({
        ...etappe,
        tracks: replaceAt(etappe.tracks, location.trackIndex, {
          ...etappe.tracks[location.trackIndex]!,
          label: name,
        }),
      }));
    default:
      return project;
  }
}

// ---------- remove ----------

export function removeGroup(project: Project, groupId: Id): Project {
  const { groupIndex } = requireLocation(project, groupId, 'group');
  return { ...project, groups: removeAt(project.groups, groupIndex) };
}

export function removeEtappe(project: Project, etappeId: Id): Project {
  const { groupIndex, etappeIndex } = requireLocation(project, etappeId, 'etappe');
  return updateGroup(project, groupIndex, (group) => ({
    ...group,
    etappen: removeAt(group.etappen, etappeIndex),
  }));
}

/** Removes a vehicle. A camera that followed it switches to keeping all vehicles in frame. */
export function removeTrack(project: Project, trackId: Id): Project {
  const { groupIndex, etappeIndex, trackIndex } = requireLocation(project, trackId, 'track');
  return updateEtappe(project, groupIndex, etappeIndex, (etappe) => {
    const tracks = removeAt(etappe.tracks, trackIndex);
    if (etappe.view.camera.followTrackId !== trackId) return { ...etappe, tracks };
    const { followTrackId: _unused, ...camera } = etappe.view.camera;
    return {
      ...etappe,
      tracks,
      view: { ...etappe.view, camera: { ...camera, mode: 'follow-all' } },
    };
  });
}

/** Removes any group, stage or track by ID. */
export function removeItem(project: Project, id: Id): Project {
  switch (locateOrThrow(project, id).kind) {
    case 'group':
      return removeGroup(project, id);
    case 'etappe':
      return removeEtappe(project, id);
    case 'track':
      return removeTrack(project, id);
    default:
      throw new Error('The project itself cannot be removed here');
  }
}

// ---------- duplicate ----------

export interface DuplicateOptions {
  /** Appended to the name of the copy, e.g. " (Kopie)". The editor passes a translated text. */
  nameSuffix?: string;
  ctx?: FactoryContext;
}

/** Deep copy with fresh IDs everywhere; references inside the copy point to the copied items. */
function copyTrack(track: Track, ctx: FactoryContext): Track {
  return {
    ...track,
    id: ctx.createId('t'),
    waypoints: track.waypoints.map((waypoint) => ({ ...waypoint, id: ctx.createId('w') })),
  };
}

function copyEtappe(etappe: Etappe, ctx: FactoryContext): Etappe {
  const newTrackIds = new Map<Id, Id>();
  const tracks = etappe.tracks.map((track) => {
    const copy = copyTrack(track, ctx);
    newTrackIds.set(track.id, copy.id);
    return copy;
  });
  const { followTrackId } = etappe.view.camera;
  const camera =
    followTrackId === undefined
      ? etappe.view.camera
      : { ...etappe.view.camera, followTrackId: newTrackIds.get(followTrackId) ?? followTrackId };
  return { ...etappe, id: ctx.createId('e'), tracks, view: { ...etappe.view, camera } };
}

/** Puts a copy right after the original and returns its ID. */
export function duplicateItem(
  project: Project,
  id: Id,
  { nameSuffix = ' (copy)', ctx = defaultFactoryContext }: DuplicateOptions = {},
): Added {
  const location = locateOrThrow(project, id);
  switch (location.kind) {
    case 'group': {
      const original = project.groups[location.groupIndex]!;
      const copy: Group = {
        ...original,
        id: ctx.createId('g'),
        name: original.name + nameSuffix,
        etappen: original.etappen.map((etappe) => copyEtappe(etappe, ctx)),
      };
      return {
        project: { ...project, groups: insertAt(project.groups, location.groupIndex + 1, copy) },
        id: copy.id,
      };
    }
    case 'etappe': {
      const original = project.groups[location.groupIndex]!.etappen[location.etappeIndex]!;
      const copy = { ...copyEtappe(original, ctx), name: original.name + nameSuffix };
      return {
        project: updateGroup(project, location.groupIndex, (group) => ({
          ...group,
          etappen: insertAt(group.etappen, location.etappeIndex + 1, copy),
        })),
        id: copy.id,
      };
    }
    case 'track': {
      const etappe = project.groups[location.groupIndex]!.etappen[location.etappeIndex]!;
      const original = etappe.tracks[location.trackIndex]!;
      const copy = {
        ...copyTrack(original, ctx),
        label: (original.label ?? '') + nameSuffix,
      };
      return {
        project: updateEtappe(project, location.groupIndex, location.etappeIndex, (current) => ({
          ...current,
          tracks: insertAt(current.tracks, location.trackIndex + 1, copy),
        })),
        id: copy.id,
      };
    }
    default:
      throw new Error('The project itself cannot be duplicated here');
  }
}

// ---------- move ----------

export function moveGroup(project: Project, groupId: Id, toIndex: number): Project {
  const { groupIndex } = requireLocation(project, groupId, 'group');
  const group = project.groups[groupIndex]!;
  return { ...project, groups: insertAt(removeAt(project.groups, groupIndex), toIndex, group) };
}

/** Moves a stage to a position in the same or another group. */
export function moveEtappe(
  project: Project,
  etappeId: Id,
  toGroupId: Id,
  toIndex: number,
): Project {
  const from = requireLocation(project, etappeId, 'etappe');
  const etappe = project.groups[from.groupIndex]!.etappen[from.etappeIndex]!;
  const withoutEtappe = updateGroup(project, from.groupIndex, (group) => ({
    ...group,
    etappen: removeAt(group.etappen, from.etappeIndex),
  }));
  const { groupIndex: toGroupIndex } = requireLocation(withoutEtappe, toGroupId, 'group');
  return updateGroup(withoutEtappe, toGroupIndex, (group) => ({
    ...group,
    etappen: insertAt(group.etappen, toIndex, etappe),
  }));
}

/** Reorders a vehicle within its stage. */
export function moveTrack(project: Project, trackId: Id, toIndex: number): Project {
  const { groupIndex, etappeIndex, trackIndex } = requireLocation(project, trackId, 'track');
  return updateEtappe(project, groupIndex, etappeIndex, (etappe) => {
    const track = etappe.tracks[trackIndex]!;
    return { ...etappe, tracks: insertAt(removeAt(etappe.tracks, trackIndex), toIndex, track) };
  });
}

function locateOrThrow(project: Project, id: Id): ItemLocation {
  const location = locateItem(project, id);
  if (!location) throw new Error(`No item with ID "${id}" in project "${project.name}"`);
  return location;
}
