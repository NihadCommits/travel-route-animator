import type { ComputedRoute } from '../model/track';

/**
 * Which leg the segment geometry[segmentIndex] → geometry[segmentIndex + 1] belongs to, i.e.
 * between which two waypoints a click on the drawn route landed.
 */
export function legIndexAtSegment(
  route: Pick<ComputedRoute, 'legs'>,
  segmentIndex: number,
): number {
  let index = 0;
  route.legs.forEach((leg, i) => {
    if (leg.startIndex <= segmentIndex) index = i;
  });
  return index;
}
