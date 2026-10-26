/**
 * Which leg the segment line[segmentIndex] → line[segmentIndex + 1] belongs to, i.e. between
 * which two waypoints a click on the drawn route landed. Takes a ComputedRoute or anything
 * else that knows where its legs start.
 */
export function legIndexAtSegment(
  route: { legs: readonly { startIndex: number }[] },
  segmentIndex: number,
): number {
  let index = 0;
  route.legs.forEach((leg, i) => {
    if (leg.startIndex <= segmentIndex) index = i;
  });
  return index;
}
