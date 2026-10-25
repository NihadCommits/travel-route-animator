import type { LngLat, Place } from '@travel-route-animator/core';
import type { FileCache } from './fileCache';
import type { GeocodingProvider, SearchBias, SearchQuery } from './provider';
import type { Throttle } from './throttle';

export interface GeocoderOptions {
  provider: GeocodingProvider;
  cache: FileCache<Place[]>;
  throttle: Throttle;
  log: (message: string) => void;
  /** The airport index, to tag airports the place search finds with their IATA code. */
  airports?: () => Promise<{ codeNear(lngLat: LngLat): string | undefined }>;
}

export type Geocoder = ReturnType<typeof createGeocoder>;

const round = (value: number, digits: number) => Number(value.toFixed(digits));

/**
 * Close enough counts as the same search: a map moved by a few hundred metres, or typed with
 * different capitals, hits the cache instead of asking Photon again.
 */
function normalizeBias(bias: SearchBias | undefined): SearchBias | undefined {
  if (!bias) return undefined;
  const [lng, lat] = bias.lngLat;
  return {
    lngLat: [round(lng, 2), round(lat, 2)],
    zoom: Math.max(0, Math.min(18, Math.round(bias.zoom))),
  };
}

const normalizeText = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();

/** Place search with cache and throttling in front of the provider (fair use, ARCHITEKTUR). */
export function createGeocoder({ provider, cache, throttle, log, airports }: GeocoderOptions) {
  async function cached(
    key: object,
    label: string,
    ask: (signal?: AbortSignal) => Promise<Place[]>,
    signal?: AbortSignal,
  ): Promise<Place[]> {
    const cacheKey = JSON.stringify({ provider: provider.name, ...key });
    const hit = await cache.get(cacheKey);
    if (hit) {
      log(`geocode cache hit: ${label}`);
      return hit;
    }
    log(`geocode → ${provider.name}: ${label}`);
    const places = await throttle(() => ask(signal), signal);
    await cache.set(cacheKey, places);
    return places;
  }

  // Photon knows "Flughafen Wien-Schwechat" by its German name, OurAirports knows it as VIE.
  // Tagging Photon's airports with the code lets the editor show such an airport once.
  async function withAirportCodes(places: Place[]): Promise<Place[]> {
    if (!airports || !places.some((place) => place.kind === 'airport')) return places;
    // Without airport data the search still works, just without the codes.
    const index = await airports().catch(() => undefined);
    if (!index) return places;
    return places.map((place) => {
      if (place.kind !== 'airport' || place.airportCode !== undefined) return place;
      const airportCode = index.codeNear(place.lngLat);
      return airportCode ? { ...place, airportCode } : place;
    });
  }

  return {
    async search(query: SearchQuery, signal?: AbortSignal): Promise<Place[]> {
      const normalized: SearchQuery = {
        ...query,
        text: normalizeText(query.text),
        bias: normalizeBias(query.bias),
      };
      const places = await cached(
        { op: 'search', ...normalized },
        `"${normalized.text}"`,
        (s) => provider.search(normalized, s),
        signal,
      );
      return withAirportCodes(places);
    },

    async reverse(lngLat: LngLat, lang: string, signal?: AbortSignal): Promise<Place | undefined> {
      // About 10 m: a second click on the same spot is a cache hit, a click elsewhere is not.
      const rounded: LngLat = [round(lngLat[0], 4), round(lngLat[1], 4)];
      const places = await cached(
        { op: 'reverse', lngLat: rounded, lang },
        `reverse ${rounded.join(',')}`,
        async (s) => {
          const place = await provider.reverse(rounded, lang, s);
          return place ? [place] : [];
        },
        signal,
      );
      return (await withAirportCodes(places))[0];
    },
  };
}
