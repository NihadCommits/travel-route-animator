import { meanMercatorBetween, type MeasuredLine } from '../geo/along';

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
  const [ax, ay] = meanMercatorBetween(line, centre - half, centre);
  const [bx, by] = meanMercatorBetween(line, centre, centre + half);
  if (ax === bx && ay === by) return 0;
  const degrees = (Math.atan2(bx - ax, by - ay) * 180) / Math.PI;
  return (degrees + 360) % 360;
}
