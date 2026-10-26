import { lineLengthM } from '../geo/distance';
import type { LngLat } from '../geo/lngLat';
import { simplifyLine } from '../geo/simplify';
import type { ComputedRoute } from '../model/track';
import { computeRouteInputHash, type RouteInput } from './inputHash';

/** One leg as a router or a local calculation delivers it: from one waypoint to the next. */
export interface LegShape {
  line: LngLat[];
  /** Missing: the length of `line`. A router knows the real road distance. */
  distanceM?: number;
  durationS?: number;
}

/** A route before it is tied to the waypoints of a track. */
export interface RouteShape {
  /** "ors", "osrm", "local-great-circle" … */
  provider: string;
  /** One leg per pair of consecutive waypoints. */
  legs: LegShape[];
}

/** Below one pixel up to zoom 14, where one pixel is about 7 m in Central Europe. */
export const SIMPLIFY_TOLERANCE_M = 5;

// Six decimals are about 10 cm: invisible, and the project file stays readable.
const roundCoordinate = (value: number) => Math.round(value * 1e6) / 1e6;

/**
 * Turns legs into the `ComputedRoute` that is stored in the track: one simplified line, the
 * index where each leg starts in it, distances and the input hash it was computed for.
 * Each leg is simplified on its own so the points at the waypoints always stay.
 */
export function assembleComputedRoute(
  track: RouteInput,
  shape: RouteShape,
  computedAt: string,
): ComputedRoute {
  const { waypoints } = track;
  if (shape.legs.length === 0 || shape.legs.length !== waypoints.length - 1) {
    throw new RangeError(
      `Expected ${waypoints.length - 1} legs for ${waypoints.length} waypoints, got ${shape.legs.length}`,
    );
  }

  const geometry: LngLat[] = [];
  const legs = shape.legs.map((leg, i) => {
    if (leg.line.length === 0) throw new RangeError(`Leg ${i} has no points`);
    const line = simplifyLine(leg.line, SIMPLIFY_TOLERANCE_M).map(([lng, lat]): LngLat => [
      roundCoordinate(lng),
      roundCoordinate(lat),
    ]);
    // Consecutive legs meet at a waypoint; that point is stored once and starts the next leg.
    const previous = geometry.at(-1);
    const shared = previous !== undefined && samePoint(previous, line[0]!);
    const startIndex = shared ? geometry.length - 1 : geometry.length;
    geometry.push(...(shared ? line.slice(1) : line));
    return {
      fromWaypointId: waypoints[i]!.id,
      toWaypointId: waypoints[i + 1]!.id,
      startIndex,
      distanceM: leg.distanceM ?? lineLengthM(leg.line),
      ...(leg.durationS !== undefined && { durationS: leg.durationS }),
    };
  });
  // A router may answer two identical waypoints with a single point; the schema wants a line.
  if (geometry.length === 1) geometry.push([...geometry[0]!]);

  const allTimed = legs.every((leg) => leg.durationS !== undefined);
  return {
    inputHash: computeRouteInputHash(track),
    geometry,
    legs,
    distanceM: legs.reduce((sum, leg) => sum + leg.distanceM, 0),
    ...(allTimed && { durationS: legs.reduce((sum, leg) => sum + (leg.durationS ?? 0), 0) }),
    provider: shape.provider,
    computedAt,
  };
}

function samePoint(a: LngLat, b: LngLat): boolean {
  return a[0] === b[0] && a[1] === b[1];
}
