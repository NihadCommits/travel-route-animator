import type { Point2 } from './closestSegment';
import type { LngLat } from './lngLat';
import { fromMercator, toMercator } from './mercator';
import { unwrapLongitudes, wrapLongitude } from './unwrap';

export interface SmoothOptions {
  /** Distance between samples in Mercator metres (≈ 1.5 ground metres in Central Europe). */
  sampleSpacingM?: number;
  /** Samples per span between two points, at least and at most. */
  minSamples?: number;
  maxSamples?: number;
}

export interface SmoothLine {
  line: LngLat[];
  /** Where each input point ended up in `line`; the curve passes through all of them. */
  pointIndices: number[];
}

/**
 * A smooth curve through all points, for trains and ferries: more shape points, closer to the
 * real track.
 *
 * Centripetal Catmull-Rom: each span between two points is shaped by its neighbours, and the
 * curve goes exactly through every point. The centripetal variant (knots spaced by the square
 * root of the distance) avoids the loops and cusps the plain variant makes when points are
 * unevenly spaced. Computed in Web Mercator, so the curve looks even on the map.
 */
export function smoothLine(points: readonly LngLat[], options: SmoothOptions = {}): SmoothLine {
  const { sampleSpacingM = 2_000, minSamples = 8, maxSamples = 64 } = options;
  const first = points[0];
  if (first === undefined) return { line: [], pointIndices: [] };

  const projected = unwrapLongitudes(points).map(toMercator);
  const line: LngLat[] = [[...first]];
  const pointIndices = [0];

  for (let i = 0; i < projected.length - 1; i++) {
    const p1 = projected[i]!;
    const p2 = projected[i + 1]!;
    // At the ends there is no neighbour; mirroring the next point keeps the curve straight there.
    const p0 = projected[i - 1] ?? mirror(p2, p1);
    const p3 = projected[i + 2] ?? mirror(p1, p2);

    const spanLength = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    if (spanLength > 0) {
      const samples = clamp(Math.ceil(spanLength / sampleSpacingM), minSamples, maxSamples);
      const curve = catmullRomSpan(p0, p1, p2, p3);
      for (let s = 1; s < samples; s++) {
        const [lng, lat] = fromMercator(curve(s / samples));
        line.push([wrapLongitude(lng), lat]);
      }
    }
    // The input point itself, not the computed one, so the curve meets the marker exactly.
    line.push([...points[i + 1]!]);
    pointIndices.push(line.length - 1);
  }
  return { line, pointIndices };
}

/** Point on the span p1 → p2 at u in 0..1 (Barry and Goldman's pyramidal form). */
function catmullRomSpan(p0: Point2, p1: Point2, p2: Point2, p3: Point2): (u: number) => Point2 {
  // Centripetal knots: the square root of the distance. The tiny minimum keeps two identical
  // neighbours from dividing by zero; their weights then simply cancel out.
  const knot = (a: Point2, b: Point2) =>
    Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), 1e-6) ** 0.5;
  const t0 = 0;
  const t1 = t0 + knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);

  return (u) => {
    const t = t1 + (t2 - t1) * u;
    const a1 = lerp(p0, p1, (t - t0) / (t1 - t0));
    const a2 = lerp(p1, p2, (t - t1) / (t2 - t1));
    const a3 = lerp(p2, p3, (t - t2) / (t3 - t2));
    const b1 = lerp(a1, a2, (t - t0) / (t2 - t0));
    const b2 = lerp(a2, a3, (t - t1) / (t3 - t1));
    return lerp(b1, b2, (t - t1) / (t2 - t1));
  };
}

function lerp([ax, ay]: Point2, [bx, by]: Point2, f: number): Point2 {
  return [ax + (bx - ax) * f, ay + (by - ay) * f];
}

/** `point` reflected through `center`. */
function mirror(point: Point2, center: Point2): Point2 {
  return [2 * center[0] - point[0], 2 * center[1] - point[1]];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
