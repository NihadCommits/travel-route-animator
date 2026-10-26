import { greatCircle } from '../geo/greatCircle';
import type { LngLat } from '../geo/lngLat';
import { smoothLine } from '../geo/smooth';
import type { RoutingMode } from '../model/enums';
import type { ComputedRoute } from '../model/track';
import { assembleComputedRoute, type LegShape } from './assemble';
import type { RouteInput } from './inputHash';

/** Routing modes computed right here, without a router: instant and offline. */
export const LOCAL_ROUTING_MODES = ['great-circle', 'straight', 'smooth'] as const;
export type LocalRoutingMode = (typeof LOCAL_ROUTING_MODES)[number];

export function isLocalRoutingMode(mode: RoutingMode): mode is LocalRoutingMode {
  return (LOCAL_ROUTING_MODES as readonly RoutingMode[]).includes(mode);
}

/**
 * The route of a plane, train, ferry or "straight" track. Undefined for modes that need a
 * router (road, cycling, walking, hiking), for GPX and for tracks with fewer than two points.
 * `computedAt` comes from the caller, so the function stays pure.
 */
export function computeLocalRoute(
  track: RouteInput,
  computedAt: string,
): ComputedRoute | undefined {
  const { mode } = track.routing;
  if (!isLocalRoutingMode(mode) || track.waypoints.length < 2) return undefined;
  const points = track.waypoints.map((waypoint) => waypoint.lngLat);
  return assembleComputedRoute(
    track,
    { provider: `local-${mode}`, legs: localLegs(mode, points) },
    computedAt,
  );
}

function localLegs(mode: LocalRoutingMode, points: LngLat[]): LegShape[] {
  const pairs = points.slice(1).map((to, i): [LngLat, LngLat] => [points[i]!, to]);
  switch (mode) {
    case 'great-circle':
      return pairs.map(([from, to]) => ({ line: greatCircle(from, to) }));
    case 'straight':
      return pairs.map(([from, to]) => ({ line: [[...from], [...to]] }));
    case 'smooth': {
      // One curve through all points, cut at the points: the bends must flow across them.
      const { line, pointIndices } = smoothLine(points);
      return pairs.map((_, i) => ({ line: line.slice(pointIndices[i], pointIndices[i + 1]! + 1) }));
    }
  }
}
