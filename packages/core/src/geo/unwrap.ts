import type { LngLat } from './lngLat';

/**
 * Shifts longitudes by whole turns so that neighbouring points are never more than 180° apart.
 *
 * Routes are stored in the normal range −180..180. A flight from Tokyo (139°) to Los Angeles
 * (−118°) then has a step of 257° where it crosses the date line, and a map would draw that
 * step the long way round, straight across the world. Unwrapped, the line runs 139° → 180° →
 * 242°, which MapLibre draws continuously over the Pacific. Only for drawing and fitting the
 * map; the stored geometry stays in range.
 */
export function unwrapLongitudes(line: readonly LngLat[]): LngLat[] {
  const result: LngLat[] = [];
  let previous: number | undefined;
  for (const [lng, lat] of line) {
    let unwrapped = lng;
    if (previous !== undefined) {
      unwrapped = lng + 360 * Math.round((previous - lng) / 360);
    }
    result.push([unwrapped, lat]);
    previous = unwrapped;
  }
  return result;
}

/** Back into −180..180, for points computed from unwrapped lines. */
export function wrapLongitude(lng: number): number {
  // In range already: return it untouched, the arithmetic below would add rounding noise.
  if (lng >= -180 && lng <= 180) return lng;
  const wrapped = ((((lng + 180) % 360) + 360) % 360) - 180;
  // Keep 180 itself rather than turning it into −180; both are valid, 180 reads better.
  return wrapped === -180 && lng > 0 ? 180 : wrapped;
}
