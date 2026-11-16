import {
  countryAt,
  indexCountries,
  type CountryIndex,
  type LngLat,
  type Topology,
} from '@travel-route-animator/core';
import countries50m from 'world-atlas/countries-50m.json';
import { FLAG_URLS } from './flagUrls';

// The flag block (M17): the country under the vehicle, from Natural Earth's borders, and its
// flag from flag-icons. Both come with the bundle; nothing is fetched from elsewhere.

let index: CountryIndex | undefined;

/** The flag of the country at a point, if it is on land (or just off a coast). */
export function flagAt(lngLat: LngLat): string | undefined {
  // Decoded on first use (some 15 ms), then kept for the page.
  index ??= indexCountries(countries50m as unknown as Topology);
  const code = countryAt(index, lngLat);
  return code === undefined ? undefined : FLAG_URLS[code];
}
