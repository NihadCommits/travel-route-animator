import type { Point2 } from './closestSegment';
import type { LngLat } from './lngLat';

/** Radius of the Web Mercator sphere (EPSG:3857), the projection MapLibre draws in. */
const MERCATOR_RADIUS_M = 6_378_137;
/** Beyond this latitude Web Mercator goes to infinity; MapLibre cuts the map off here too. */
const MAX_MERCATOR_LAT = 85.051129;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

/**
 * Web Mercator metres. A straight line here is a straight line on the map, which is what the
 * smoothing and the simplification need: they should look right on screen, not on a globe.
 * Longitudes are not wrapped, so an unwrapped line (see unwrapLongitudes) stays continuous.
 */
export function toMercator([lng, lat]: LngLat): Point2 {
  const clamped = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat));
  return [
    MERCATOR_RADIUS_M * toRadians(lng),
    MERCATOR_RADIUS_M * Math.log(Math.tan(Math.PI / 4 + toRadians(clamped) / 2)),
  ];
}

export function fromMercator([x, y]: Point2): LngLat {
  return [
    toDegrees(x / MERCATOR_RADIUS_M),
    toDegrees(2 * Math.atan(Math.exp(y / MERCATOR_RADIUS_M)) - Math.PI / 2),
  ];
}

/**
 * How many ground metres one Mercator metre is worth at this latitude. Mercator stretches
 * everything away from the equator by 1 / cos(latitude); this undoes it locally.
 */
export function mercatorScale(lat: number): number {
  return Math.cos(toRadians(lat));
}
