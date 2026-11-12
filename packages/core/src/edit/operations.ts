import type { ImageAsset } from '../model/assets';
import type { CameraMode, VehicleType, ViewMode } from '../model/enums';
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
import { isRoutingAllowed, recommendViewMode, VEHICLE_CATALOG } from '../model/vehicles';
import { defaultFlightOptions, defaultPitch, defaultView, TRACK_COLORS } from '../model/defaults';
import { insertAt, removeAt, replaceAt } from './arrays';
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

  const updated = updateEtappe(project, groupIndex, etappeIndex, (current) =>
    withTrack(current, track, current.tracks.length),
  );
  return { project: updated, id: track.id };
}

/**
 * Puts a vehicle into a stage at a position. The first vehicle of a stage sets its view to
 * the one recommended for it and becomes the camera target (addTrack, moveTrack).
 */
function withTrack(etappe: Etappe, track: Track, index: number): Etappe {
  const tracks = insertAt(etappe.tracks, index, track);
  if (etappe.tracks.length > 0) return { ...etappe, tracks };
  const camera = { ...etappe.view.camera, mode: 'follow' as const, followTrackId: track.id };
  return { ...etappe, tracks, view: defaultView(recommendViewMode([track.vehicle.type]), camera) };
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
      // Without a label the editor shows the vehicle type ("Auto"), which beats an empty name.
      return editTrack(project, id, ({ label: _old, ...track }) =>
        name === '' ? track : { ...track, label: name },
      );
    default:
      return project;
  }
}

// ---------- edit ----------

// Generic edits by ID for the inspector: `update` gets the current item and returns the new
// one. Whether the result is valid is up to the caller (the editor checks with validateProject).

export function editGroup(project: Project, groupId: Id, update: (group: Group) => Group): Project {
  const { groupIndex } = requireLocation(project, groupId, 'group');
  return updateGroup(project, groupIndex, update);
}

export function editEtappe(
  project: Project,
  etappeId: Id,
  update: (etappe: Etappe) => Etappe,
): Project {
  const { groupIndex, etappeIndex } = requireLocation(project, etappeId, 'etappe');
  return updateEtappe(project, groupIndex, etappeIndex, update);
}

export function editTrack(project: Project, trackId: Id, update: (track: Track) => Track): Project {
  const { groupIndex, etappeIndex, trackIndex } = requireLocation(project, trackId, 'track');
  return updateEtappe(project, groupIndex, etappeIndex, (etappe) => ({
    ...etappe,
    tracks: replaceAt(etappe.tracks, trackIndex, update(etappe.tracks[trackIndex]!)),
  }));
}

/**
 * Switches a track to another vehicle and keeps it consistent with the vehicle catalog: the
 * routing stays if the new vehicle allows it (a car switched to a bus keeps "straight"),
 * otherwise it becomes the vehicle's default; flight options come and go with the plane.
 */
export function changeVehicleType(project: Project, trackId: Id, type: VehicleType): Project {
  return editTrack(project, trackId, (track) => {
    if (track.vehicle.type === type) return track;
    const { flight: _flight, ...rest } = track;
    const keepRouting = isRoutingAllowed(type, track.routing.mode);
    return {
      ...rest,
      vehicle: { type, variant: `${type}-default` },
      routing: keepRouting ? track.routing : { mode: VEHICLE_CATALOG[type].defaultRouting },
      ...(type === 'plane' && { flight: track.flight ?? defaultFlightOptions() }),
    };
  });
}

/**
 * Draws a track's vehicle as an image (ADR 0009). The image joins the project's assets unless
 * it is there already, so adding a picture and using it is one step to undo. A new image
 * stands upright; switching between images keeps the track's choice of turning.
 */
export function setImageIcon(project: Project, trackId: Id, asset: ImageAsset): Project {
  const known = project.assets.some((existing) => existing.id === asset.id);
  const withAsset = known ? project : { ...project, assets: [...project.assets, asset] };
  return editTrack(withAsset, trackId, (track) => {
    const { icon } = track.style;
    const rotates = icon.kind === 'image' ? icon.rotates : false;
    return {
      ...track,
      style: { ...track.style, icon: { kind: 'image', assetId: asset.id, rotates } },
    };
  });
}

/** Changes how a stage is shown; the tilt goes to the typical value of the new view. */
export function setViewMode(project: Project, etappeId: Id, mode: ViewMode): Project {
  return editEtappe(project, etappeId, (etappe) =>
    etappe.view.mode === mode
      ? etappe
      : { ...etappe, view: { ...etappe.view, mode, pitchDeg: defaultPitch(mode) } },
  );
}

/**
 * Changes the camera mode. Following needs a vehicle; if none is chosen yet (or the chosen one
 * is gone), the camera takes the first vehicle of the stage. Other modes keep the choice, so
 * switching back to following remembers it.
 */
export function setCameraMode(project: Project, etappeId: Id, mode: CameraMode): Project {
  return editEtappe(project, etappeId, (etappe) => {
    const { camera } = etappe.view;
    const [firstTrack] = etappe.tracks;
    const hasTarget = etappe.tracks.some((track) => track.id === camera.followTrackId);
    const followTrackId =
      mode === 'follow' && !hasTarget && firstTrack ? firstTrack.id : camera.followTrackId;
    return {
      ...etappe,
      view: {
        ...etappe.view,
        camera: { ...camera, mode, ...(followTrackId !== undefined && { followTrackId }) },
      },
    };
  });
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

/**
 * Makes the vehicles of a stage read as alternatives ("Wohin morgen?", ADR 0008): dashed lines,
 * all starting together, each in a colour of its own. A vehicle without waypoints yet starts
 * where the first one does, so new options only need their destination. One change, so it is
 * one undo step.
 */
export function presentAsOptions(
  project: Project,
  etappeId: Id,
  ctx: FactoryContext = defaultFactoryContext,
): Project {
  return editEtappe(project, etappeId, (etappe) => {
    const { tracks } = etappe;
    if (tracks.length === 0) return etappe;
    const start = Math.min(...tracks.map((track) => track.timing.startOffsetSec));
    const from = tracks.find((track) => track.waypoints.length > 0)?.waypoints[0];
    // The first track with a colour keeps it; later ones with the same colour get a free one.
    const seen = new Set<string>();
    const keeps = tracks.map((track) => {
      const color = track.style.lineColor.toUpperCase();
      const first = !seen.has(color);
      seen.add(color);
      return first;
    });
    const free = TRACK_COLORS.filter((color) => !seen.has(color.toUpperCase()));
    let nextFree = 0;
    return {
      ...etappe,
      tracks: tracks.map((track, i) => ({
        ...track,
        waypoints:
          track.waypoints.length === 0 && from
            ? [{ ...from, id: ctx.createId('w') }]
            : track.waypoints,
        timing: { ...track.timing, startOffsetSec: start },
        style: {
          ...track.style,
          lineColor: keeps[i] ? track.style.lineColor : (free[nextFree++] ?? track.style.lineColor),
          lineDash: 'dashed',
        },
      })),
    };
  });
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

/**
 * Moves a vehicle to a position in the same or another stage. Leaving a stage works like
 * removing it there (a camera that followed it keeps all vehicles in the picture instead);
 * arriving in an empty stage like adding it (the camera follows it). Its timing stays as it
 * is: the timeline and the render check show where it no longer fits the new stage.
 */
export function moveTrack(project: Project, trackId: Id, toEtappeId: Id, toIndex: number): Project {
  const from = requireLocation(project, trackId, 'track');
  const to = requireLocation(project, toEtappeId, 'etappe');
  const track =
    project.groups[from.groupIndex]!.etappen[from.etappeIndex]!.tracks[from.trackIndex]!;
  if (from.groupIndex === to.groupIndex && from.etappeIndex === to.etappeIndex) {
    return updateEtappe(project, from.groupIndex, from.etappeIndex, (etappe) => ({
      ...etappe,
      tracks: insertAt(removeAt(etappe.tracks, from.trackIndex), toIndex, track),
    }));
  }
  // Removing a vehicle changes no stage's position, so `to` still points at the target.
  return updateEtappe(removeTrack(project, trackId), to.groupIndex, to.etappeIndex, (etappe) =>
    withTrack(etappe, track, toIndex),
  );
}

function locateOrThrow(project: Project, id: Id): ItemLocation {
  const location = locateItem(project, id);
  if (!location) throw new Error(`No item with ID "${id}" in project "${project.name}"`);
  return location;
}
