import type { LngLat } from './lngLat';

/** A box in (unwrapped) longitude and latitude; east may be beyond 180 for Pacific routes. */
export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export function boundsOf(points: Iterable<LngLat>): Bounds | undefined {
  let bounds: Bounds | undefined;
  for (const [lng, lat] of points) {
    if (!bounds) {
      bounds = { west: lng, south: lat, east: lng, north: lat };
      continue;
    }
    bounds.west = Math.min(bounds.west, lng);
    bounds.east = Math.max(bounds.east, lng);
    bounds.south = Math.min(bounds.south, lat);
    bounds.north = Math.max(bounds.north, lat);
  }
  return bounds;
}
