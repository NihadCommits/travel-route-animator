import type { Project } from '../model/project';
import { isRouteStale } from './inputHash';
import { computeLocalRoute, isLocalRoutingMode } from './localRoute';

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
