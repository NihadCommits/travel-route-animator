import type { Etappe } from '../model/etappe';
import type { Project } from '../model/project';
import type { Track } from '../model/track';
import { isRouteStale } from './inputHash';
import { computeLocalRoute, isLocalRoutingMode } from './localRoute';

/**
 * Whether the track's route comes from a router (road, cycling, walking, hiking) through the
 * server. Local modes are computed right away, GPX brings its own line, and a track without
 * two points has no route yet.
 */
export function needsRouter(track: Pick<Track, 'routing' | 'waypoints'>): boolean {
  const { mode } = track.routing;
  return !isLocalRoutingMode(mode) && mode !== 'gpx' && track.waypoints.length >= 2;
}

/**
 * The stage's tracks still waiting for their router route: none yet, or one that no longer
 * fits the points. Rendering them now would show straight stand-in lines.
 */
export function tracksAwaitingRoute(etappe: Pick<Etappe, 'tracks'>): Track[] {
  return etappe.tracks.filter((track) => needsRouter(track) && isRouteStale(track));
}

/**
 * Recomputes every stale route that needs no router (planes, trains, ferries, straight
 * lines). Fresh routes and router modes stay as they are. Returns the same project object
 * when nothing changed, and keeps unchanged groups, stages and tracks identical, so the
 * editor can call it after every edit for free.
 */
export function refreshLocalRoutes(project: Project, computedAt: string): Project {
  let changed = false;
  const groups = project.groups.map((group) => {
    let groupChanged = false;
    const etappen = group.etappen.map((etappe) => {
      let etappeChanged = false;
      const tracks = etappe.tracks.map((track) => {
        if (!isLocalRoutingMode(track.routing.mode) || !isRouteStale(track)) return track;
        const computed = computeLocalRoute(track, computedAt);
        // Fewer than two points: no route, and an old one no longer fits.
        if (!computed && !track.computed) return track;
        etappeChanged = true;
        const { computed: _old, ...rest } = track;
        return computed ? { ...rest, computed } : rest;
      });
      if (!etappeChanged) return etappe;
      groupChanged = true;
      return { ...etappe, tracks };
    });
    if (!groupChanged) return group;
    changed = true;
    return { ...group, etappen };
  });
  return changed ? { ...project, groups } : project;
}
