import { distanceM } from './distance';
import type { LngLat } from './lngLat';
import { unwrapLongitudes } from './unwrap';

/**
 * A polyline prepared for "where is the vehicle after s metres": unwrapped over the date line
 * and with the distance from the start to every point. Built once per track in the timeline,
 * then every frame only does a binary search instead of measuring the line again.
 */
export interface MeasuredLine {
  /** Unwrapped, so neighbouring points are never more than 180° apart. */
  points: readonly LngLat[];
  /** Ground distance from the start to points[i], in metres. */
  cumulative: readonly number[];
  lengthM: number;
}

export function measureLine(line: readonly LngLat[]): MeasuredLine {
  const points = unwrapLongitudes(line);
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1]! + distanceM(points[i - 1]!, points[i]!));
  }
  return { points, cumulative, lengthM: cumulative.at(-1) ?? 0 };
}

/** Index i of the segment points[i] → points[i + 1] that contains distance s. */
function segmentAt({ cumulative }: MeasuredLine, s: number): number {
  let low = 0;
  let high = cumulative.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (cumulative[middle]! <= s) low = middle;
    else high = middle;
  }
  return low;
}

/** The point s metres along the line, clamped to its ends. */
export function pointAt(line: MeasuredLine, s: number): LngLat {
  const { points, cumulative, lengthM } = line;
  const first = points[0];
  if (!first) throw new RangeError('An empty line has no points');
  if (points.length === 1 || s <= 0) return [...first];
  if (s >= lengthM) return [...points.at(-1)!];
  const i = segmentAt(line, s);
  const a = points[i]!;
  const b = points[i + 1]!;
  const span = cumulative[i + 1]! - cumulative[i]!;
  // Linear between two points: they are close (routers, 50 km great-circle steps), so the
  // difference to the true curve is far below a pixel.
  const f = span > 0 ? (s - cumulative[i]!) / span : 0;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

/**
 * The line from its start up to s metres, ending exactly at pointAt(s): what has been driven.
 * Always at least two points, so it can go straight into a GeoJSON LineString.
 */
export function lineUntil(line: MeasuredLine, s: number): LngLat[] {
  const { points, lengthM } = line;
  const first = points[0];
  if (!first) throw new RangeError('An empty line has no points');
  if (s <= 0 || points.length === 1) return [[...first], [...first]];
  if (s >= lengthM) return points.map((point) => [...point]);
  const i = segmentAt(line, s);
  const driven = points.slice(0, i + 1).map((point): LngLat => [...point]);
  driven.push(pointAt(line, s));
  return driven;
}
