import type { Place } from '@travel-route-animator/core';

/**
 * A waypoint name for a point clicked on the map, e.g. "Silves, Faro". Photon answers such a
 * click with the nearest feature: a square, a library, a lone farmstead. The municipality and
 * its region are what a travel video wants to show, so they come first; the feature's own
 * name is only used when it is the town itself (a town carries no separate city field).
 */
export function suggestWaypointName(place: Place): string {
  const town = place.city ?? place.district ?? place.name;
  const region = place.county ?? place.state;
  if (!town) return region ?? '';
  return region && region !== town ? `${town}, ${region}` : town;
}
