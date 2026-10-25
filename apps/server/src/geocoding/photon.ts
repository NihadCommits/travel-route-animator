import type { LngLat, Place, PlaceKind } from '@travel-route-animator/core';
import { z } from 'zod';
import { GeocodingUnavailableError, type GeocodingProvider } from './provider';

// Only what we read from Photon's GeocodeJSON answer; everything else passes through unchecked.
const PhotonFeature = z.object({
  geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
  properties: z
    .object({
      osm_type: z.string(),
      osm_id: z.number(),
      osm_key: z.string(),
      osm_value: z.string(),
      type: z.string(),
      name: z.string(),
      street: z.string(),
      housenumber: z.string(),
      city: z.string(),
      district: z.string(),
      county: z.string(),
      state: z.string(),
      country: z.string(),
      countrycode: z.string(),
    })
    .partial(),
});
type PhotonFeature = z.infer<typeof PhotonFeature>;

const PhotonResponse = z.object({ features: z.array(PhotonFeature) });

const STATION_VALUES = new Set(['station', 'halt', 'stop', 'stop_position']);
const LOCALITY_TYPES = new Set(['city', 'locality', 'district']);
const REGION_TYPES = new Set(['county', 'state', 'country']);

function kindOf(p: PhotonFeature['properties']): PlaceKind {
  const { osm_key: key, osm_value: value, type } = p;
  if (key === 'aeroway' && value === 'aerodrome') return 'airport';
  if ((key === 'railway' || key === 'public_transport') && value && STATION_VALUES.has(value)) {
    return 'station';
  }
  // Photon files plain addresses as place=house; real places are place=city, town, village …
  if (key === 'place' && value === 'house') return 'address';
  if (type && REGION_TYPES.has(type)) return 'region';
  if (key === 'place' || (type && LOCALITY_TYPES.has(type))) return 'locality';
  if (type === 'street') return 'street';
  if (p.housenumber !== undefined && p.name === undefined) return 'address';
  return 'poi';
}

/** Photon's feature in our own shape. Missing fields stay missing, as the schema is strict. */
export function placeFromPhoton(feature: PhotonFeature): Place {
  const p = feature.properties;
  const [lng, lat] = feature.geometry.coordinates;
  const address = [p.street, p.housenumber].filter(Boolean).join(' ');
  return {
    id:
      p.osm_type !== undefined && p.osm_id !== undefined
        ? `photon:${p.osm_type}${p.osm_id}`
        : `photon:${lng},${lat}`,
    name: p.name ?? address,
    lngLat: [lng, lat],
    kind: kindOf(p),
    source: 'search',
    ...(p.city !== undefined && { city: p.city }),
    ...(p.district !== undefined && { district: p.district }),
    ...(p.county !== undefined && { county: p.county }),
    ...(p.state !== undefined && { state: p.state }),
    ...(p.country !== undefined && { country: p.country }),
    ...(p.countrycode !== undefined && { countryCode: p.countrycode.toUpperCase() }),
  };
}

export interface PhotonOptions {
  baseUrl: string;
  /** Free services ask for a User-Agent that says who is calling. */
  userAgent: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

export function createPhotonProvider({
  baseUrl,
  userAgent,
  timeoutMs = 8000,
  fetch = globalThis.fetch,
}: PhotonOptions): GeocodingProvider {
  async function request(path: string, params: URLSearchParams, signal?: AbortSignal) {
    const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
    url.search = params.toString();
    const timeout = AbortSignal.timeout(timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { 'User-Agent': userAgent, Accept: 'application/json' },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch (error) {
      // A cancelled search is not an outage; let the caller see the abort as it is.
      if (signal?.aborted) throw error;
      throw new GeocodingUnavailableError(`Photon is not reachable (${url.host})`, {
        cause: error,
      });
    }
    if (!response.ok) {
      throw new GeocodingUnavailableError(`Photon answered ${response.status} for ${url.pathname}`);
    }
    const parsed = PhotonResponse.safeParse(await response.json());
    if (!parsed.success) throw new GeocodingUnavailableError('Photon sent an unexpected answer');
    return parsed.data.features.map(placeFromPhoton);
  }

  return {
    name: 'photon',
    search({ text, lang, bias, limit }, signal) {
      const params = new URLSearchParams({ q: text, lang, limit: String(limit) });
      if (bias) {
        const [lng, lat] = bias.lngLat;
        params.set('lon', String(lng));
        params.set('lat', String(lat));
        params.set('zoom', String(bias.zoom));
      }
      return request('api', params, signal);
    },
    async reverse(lngLat: LngLat, lang, signal) {
      const [lng, lat] = lngLat;
      const params = new URLSearchParams({ lon: String(lng), lat: String(lat), lang, limit: '1' });
      const [place] = await request('reverse', params, signal);
      return place;
    },
  };
}
