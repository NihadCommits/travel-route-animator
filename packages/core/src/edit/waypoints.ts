import type { LngLat } from '../geo/lngLat';
import type { WaypointKind } from '../model/enums';
import {
  createWaypoint,
  defaultFactoryContext,
  type CreateWaypointInput,
  type FactoryContext,
} from '../model/factories';
import type { Id } from '../model/primitives';
import type { Project } from '../model/project';
import type { Track, Waypoint } from '../model/track';
import { insertAt, removeAt, replaceAt } from './arrays';
import { editTrack, type Added } from './operations';

// Waypoint edits work like the other operations: a new project comes back, the input stays
// untouched. Whether the track is renderable afterwards (two points, stops at both ends) is
// checked by checkRenderReadiness, not here (ADR 0002).

function indexOf(track: Track, waypointId: Id): number {
  const index = track.waypoints.findIndex((waypoint) => waypoint.id === waypointId);
  if (index === -1) throw new Error(`No waypoint with ID "${waypointId}" in track "${track.id}"`);
  return index;
}

export interface AddWaypointOptions {
  /** Position in the track; default is the end. */
  index?: number;
  ctx?: FactoryContext;
}

/** Adds a waypoint and returns its ID, so the editor can select it. */
export function addWaypoint(
  project: Project,
  trackId: Id,
  input: CreateWaypointInput,
  { index, ctx = defaultFactoryContext }: AddWaypointOptions = {},
): Added {
  const waypoint = createWaypoint(input, ctx);
  const updated = editTrack(project, trackId, (track) => ({
    ...track,
    waypoints: insertAt(track.waypoints, index ?? track.waypoints.length, waypoint),
  }));
  return { project: updated, id: waypoint.id };
}

export function editWaypoint(
  project: Project,
  trackId: Id,
  waypointId: Id,
  update: (waypoint: Waypoint) => Waypoint,
): Project {
  return editTrack(project, trackId, (track) => {
    const index = indexOf(track, waypointId);
    return {
      ...track,
      waypoints: replaceAt(track.waypoints, index, update(track.waypoints[index]!)),
    };
  });
}

export function moveWaypoint(
  project: Project,
  trackId: Id,
  waypointId: Id,
  toIndex: number,
): Project {
  return editTrack(project, trackId, (track) => {
    const from = indexOf(track, waypointId);
    const waypoint = track.waypoints[from]!;
    return { ...track, waypoints: insertAt(removeAt(track.waypoints, from), toIndex, waypoint) };
  });
}

export function removeWaypoint(project: Project, trackId: Id, waypointId: Id): Project {
  return editTrack(project, trackId, (track) => ({
    ...track,
    waypoints: removeAt(track.waypoints, indexOf(track, waypointId)),
  }));
}

/**
 * Switches between a stop and a shape point. A shape point only bends the route and stays
 * invisible, so it loses its hold and its label; a stop shows its label again.
 */
export function setWaypointKind(
  project: Project,
  trackId: Id,
  waypointId: Id,
  kind: WaypointKind,
): Project {
  return editWaypoint(project, trackId, waypointId, (waypoint) => {
    if (waypoint.kind === kind) return waypoint;
    return kind === 'shape'
      ? { ...waypoint, kind, holdSec: 0, showLabel: false }
      : { ...waypoint, kind, showLabel: true };
  });
}

/**
 * Puts a shape point on the segment that starts at waypoint `segmentIndex`, i.e. between that
 * waypoint and the next one. Used when the user clicks onto the line to pull it elsewhere.
 */
export function insertShapePoint(
  project: Project,
  trackId: Id,
  segmentIndex: number,
  lngLat: LngLat,
  { name = '', ctx = defaultFactoryContext }: { name?: string; ctx?: FactoryContext } = {},
): Added {
  return addWaypoint(
    project,
    trackId,
    { lngLat, name, kind: 'shape', source: 'map-click' },
    { index: segmentIndex + 1, ctx },
  );
}
