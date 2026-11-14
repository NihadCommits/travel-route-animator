import type { Point2 } from './closestSegment';
import { distanceM } from './distance';
import type { LngLat } from './lngLat';
import { fromMercator, toMercator } from './mercator';
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
 * The mean position of the line between distances a and b, in Web Mercator: the integral of
 * the position along the line divided by the length. Exact for a polyline, because the
 * position is linear on every segment (trapezoids). Used to smooth without any state: the
 * heading compares the mean behind with the mean ahead, the camera sits on the mean around.
 */
export function meanMercatorBetween(line: MeasuredLine, a: number, b: number): Point2 {
  const { points, cumulative } = line;
  let x = 0;
  let y = 0;
  let total = 0;
  for (let i = segmentAt(line, Math.max(0, a)); i < points.length - 1; i++) {
    if (cumulative[i]! >= b) break;
    const from = Math.max(a, cumulative[i]!);
    const to = Math.min(b, cumulative[i + 1]!);
    if (to <= from) continue;
    const [px, py] = toMercator(pointAt(line, from));
    const [qx, qy] = toMercator(pointAt(line, to));
    const length = to - from;
    x += ((px + qx) / 2) * length;
    y += ((py + qy) / 2) * length;
    total += length;
  }
  return total > 0 ? [x / total, y / total] : toMercator(pointAt(line, a));
}

/**
 * The line's point at s, smoothed over `halfWindowM` on either side: on a straight road the
 * point itself, in a bend a little inside it, and a zigzag much smaller than the window
 * averages out. The window shrinks towards the ends, so the start and the end stay exact.
 */
export function smoothedPointAt(line: MeasuredLine, s: number, halfWindowM: number): LngLat {
  const clamped = Math.min(Math.max(s, 0), line.lengthM);
  const half = Math.min(halfWindowM, clamped, line.lengthM - clamped);
  if (half <= 0) return pointAt(line, clamped);
  return fromMercator(meanMercatorBetween(line, clamped - half, clamped + half));
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

/**
 * The rest of the line, from s metres to its end, listed backwards from the end to pointAt(s):
 * the route still ahead. Backwards because a dash pattern starts at a line's first point; from
 * the fixed end the dashes stay put while the vehicle moves (ADR 0008). At least two points.
 */
export function lineAhead(line: MeasuredLine, s: number): LngLat[] {
  const { points, lengthM } = line;
  const last = points.at(-1);
  if (!last) throw new RangeError('An empty line has no points');
  if (s >= lengthM || points.length === 1) return [[...last], [...last]];
  if (s <= 0) return points.map((point): LngLat => [...point]).reverse();
  const i = segmentAt(line, s);
  const rest = points.slice(i + 1).map((point): LngLat => [...point]);
  rest.reverse();
  rest.push(pointAt(line, s));
  return rest;
}

/**
 * The place on the line closest to `point`: how far along it lies and how far away it is, in
 * ground metres. Measured on each segment in Web Mercator and scaled back at the point's
 * latitude, like simplifyLine; good enough for "which part of the route passes a photo".
 */
export function closestOnLine(line: MeasuredLine, point: LngLat): { s: number; distanceM: number } {
  const [px, py] = toMercator(point);
  let best = { s: 0, distanceM: Number.POSITIVE_INFINITY };
  const scale = Math.cos((point[1] * Math.PI) / 180);
  for (let i = 0; i < line.points.length - 1; i++) {
    const [ax, ay] = toMercator(line.points[i]!);
    const [bx, by] = toMercator(line.points[i + 1]!);
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const t =
      lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
    const away = Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * scale;
    if (away < best.distanceM) {
      const from = line.cumulative[i]!;
      best = { s: from + t * (line.cumulative[i + 1]! - from), distanceM: away };
    }
  }
  if (line.points.length === 1) {
    best = { s: 0, distanceM: Math.hypot(...sub(toMercator(line.points[0]!), [px, py])) * scale };
  }
  return best;
}

const sub = ([ax, ay]: Point2, [bx, by]: Point2): [number, number] => [ax - bx, ay - by];
