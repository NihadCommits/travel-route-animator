import { centralAngle, EARTH_RADIUS_M } from './distance';
import type { LngLat } from './lngLat';

export interface GreatCircleOptions {
  /** Longest step between two points of the result; the arc looks round at any zoom. */
  maxStepM?: number;
  /** Fewest steps, so that even a short hop is drawn as an arc and not as a straight line. */
  minSteps?: number;
}

type Vector3 = [x: number, y: number, z: number];

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

function toVector([lng, lat]: LngLat): Vector3 {
  const lambda = toRadians(lng);
  const phi = toRadians(lat);
  return [Math.cos(phi) * Math.cos(lambda), Math.cos(phi) * Math.sin(lambda), Math.sin(phi)];
}

function toLngLat([x, y, z]: Vector3): LngLat {
  return [toDegrees(Math.atan2(y, x)), toDegrees(Math.atan2(z, Math.hypot(x, y)))];
}

/**
 * The shortest path between two points on the globe, as a polyline. On a Mercator map it is a
 * curve: Vienna → Porto bends north, a flight over the Pacific bends towards the Aleutians.
 *
 * Spherical linear interpolation (slerp) between the two points as unit vectors: every
 * intermediate point lies on the great circle through both. The ends are the input points
 * exactly, longitudes stay in −180..180 (unwrap for drawing, see unwrap.ts).
 */
export function greatCircle(from: LngLat, to: LngLat, options: GreatCircleOptions = {}): LngLat[] {
  const { maxStepM = 50_000, minSteps = 16 } = options;
  const angle = centralAngle(from, to);
  if (angle < 1e-12) return [[...from], [...to]];

  // Exact antipodes are joined by every meridian, slerp has no unique answer. Go over the
  // point a quarter turn away along the start's meridian, which is one of the shortest paths.
  if (Math.PI - angle < 1e-9) {
    const via = quarterTurnNorth(from);
    const first = greatCircle(from, via, options);
    return [...first, ...greatCircle(via, to, options).slice(1)];
  }

  const steps = Math.max(minSteps, Math.ceil((angle * EARTH_RADIUS_M) / maxStepM));
  const a = toVector(from);
  const b = toVector(to);
  const sinAngle = Math.sin(angle);
  const line: LngLat[] = [[...from]];
  for (let step = 1; step < steps; step++) {
    const f = step / steps;
    const wa = Math.sin((1 - f) * angle) / sinAngle;
    const wb = Math.sin(f * angle) / sinAngle;
    line.push(toLngLat([wa * a[0] + wb * b[0], wa * a[1] + wb * b[1], wa * a[2] + wb * b[2]]));
  }
  line.push([...to]);
  return line;
}

/** The point 90° further north along the meridian of `point`, over the pole if need be. */
function quarterTurnNorth([lng, lat]: LngLat): LngLat {
  if (lat <= 0) return [lng, lat + 90];
  return [lng > 0 ? lng - 180 : lng + 180, 90 - lat];
}
