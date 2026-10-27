import { pointAt, type MeasuredLine } from '../geo/along';
import { toMercator } from '../geo/mercator';
import type { Point2 } from '../geo/closestSegment';

/**
 * The mean position of the line between distances a and b, in Web Mercator: the integral of
 * the position along the line divided by the length. Exact for a polyline, because the
 * position is linear on every segment (trapezoids).
 */
function meanBetween(line: MeasuredLine, a: number, b: number): Point2 {
  const { points, cumulative } = line;
  let x = 0;
  let y = 0;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
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
 * Which way the vehicle points at distance s, in degrees clockwise from north.
 *
 * Without any state from earlier frames: the direction from the average position over the
 * stretch behind the vehicle to the average position over the stretch ahead. That is the
 * slope of the line smoothed with a triangular filter, which flattens a road's small kinks far
 * better than the direction between two single points would. computeFrameState sizes the
 * stretch in screen pixels, so the icon follows the bends you can see.
 * Measured in Web Mercator, where the map draws: the icon lines up with the drawn line.
 */
export function headingAt(line: MeasuredLine, s: number, windowM: number): number {
  const { lengthM } = line;
  if (lengthM <= 0) return 0;
  // Near the ends the window slides inside the line, so the start already points the way.
  const half = Math.min(windowM, lengthM / 2);
  const centre = Math.min(Math.max(s, half), lengthM - half);
  const [ax, ay] = meanBetween(line, centre - half, centre);
  const [bx, by] = meanBetween(line, centre, centre + half);
  if (ax === bx && ay === by) return 0;
  const degrees = (Math.atan2(bx - ax, by - ay) * 180) / Math.PI;
  return (degrees + 360) % 360;
}
