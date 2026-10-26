import { distanceToSegment } from './closestSegment';
import type { LngLat } from './lngLat';
import { mercatorScale, toMercator } from './mercator';
import { unwrapLongitudes } from './unwrap';

/**
 * Drops points that do not change the shape by more than `toleranceM` ground metres
 * (Douglas-Peucker). A road route from a router has a point every few metres; most of them
 * lie on a straight stretch and only make the project file bigger.
 *
 * The algorithm keeps the two ends, finds the point furthest from the line between them and
 * keeps it if it is further than the tolerance; then it repeats on both halves. Distances are
 * measured in Web Mercator (what the map draws) and scaled back to ground metres at the
 * point's latitude. The first and last point always survive, which is why each leg of a route
 * is simplified on its own: the leg boundaries stay where they are.
 */
export function simplifyLine(line: readonly LngLat[], toleranceM: number): LngLat[] {
  if (line.length <= 2) return line.map((point) => [...point]);

  const projected = unwrapLongitudes(line).map(toMercator);
  const keep = new Array<boolean>(line.length).fill(false);
  keep[0] = true;
  keep[line.length - 1] = true;

  // An explicit stack instead of recursion: routes with tens of thousands of points would
  // otherwise risk a stack overflow.
  const stack: [number, number][] = [[0, line.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let furthest = -1;
    let furthestDistance = 0;
    for (let i = start + 1; i < end; i++) {
      const groundM =
        distanceToSegment(projected[i]!, projected[start]!, projected[end]!) *
        mercatorScale(line[i]![1]);
      if (groundM > furthestDistance) {
        furthest = i;
        furthestDistance = groundM;
      }
    }
    if (furthest !== -1 && furthestDistance > toleranceM) {
      keep[furthest] = true;
      stack.push([start, furthest], [furthest, end]);
    }
  }
  return line.filter((_, i) => keep[i]).map((point) => [...point]);
}
