import type { LngLat } from './lngLat';

/** Mean Earth radius, the same value Turf uses, so our lengths match @turf/length. */
export const EARTH_RADIUS_M = 6_371_008.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Central angle between two points in radians (haversine, stable for short distances). */
export function centralAngle([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const sinLat = Math.sin(toRadians(lat2 - lat1) / 2);
  // sin² of half the longitude difference is the same for 359° and −1°, so the date line
  // needs no special case here.
  const sinLng = Math.sin(toRadians(lng2 - lng1) / 2);
  const h =
    sinLat * sinLat + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * sinLng * sinLng;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Ground distance between two points in metres, along the surface of the sphere. */
export function distanceM(from: LngLat, to: LngLat): number {
  return centralAngle(from, to) * EARTH_RADIUS_M;
}

/** Length of a polyline in metres. */
export function lineLengthM(line: readonly LngLat[]): number {
  let total = 0;
  for (let i = 1; i < line.length; i++) total += distanceM(line[i - 1]!, line[i]!);
  return total;
}
