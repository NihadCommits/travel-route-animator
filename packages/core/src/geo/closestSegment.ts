/** A point on a flat plane, e.g. screen pixels. */
export type Point2 = readonly [x: number, y: number];

export interface SegmentHit {
  /** The segment runs from points[index] to points[index + 1]. */
  index: number;
  /** Shortest distance from the point to that segment. */
  distance: number;
}

/**
 * Which segment of a polyline lies closest to `point`. Works on flat coordinates on purpose:
 * the editor passes screen pixels (from map.project), where "close to the line" means what the
 * user sees, independent of zoom level and map projection.
 */
export function closestSegment(points: readonly Point2[], point: Point2): SegmentHit | undefined {
  let best: SegmentHit | undefined;
  for (let index = 0; index < points.length - 1; index++) {
    const distance = distanceToSegment(point, points[index]!, points[index + 1]!);
    if (!best || distance < best.distance) best = { index, distance };
  }
  return best;
}

function distanceToSegment([px, py]: Point2, [ax, ay]: Point2, [bx, by]: Point2): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  // Position of the foot of the perpendicular along the segment, clamped to its ends.
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
