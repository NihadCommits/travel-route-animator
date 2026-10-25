import { PlaceSchema } from '@travel-route-animator/core';
import { describe, expect, it, vi } from 'vitest';
import { createPhotonProvider, placeFromPhoton } from './photon';
import { GeocodingUnavailableError } from './provider';

// Shortened from real answers of photon.komoot.io (2026-10-25).
const airport = {
  geometry: { coordinates: [16.5848987, 48.1049968] as [number, number] },
  properties: {
    osm_type: 'W',
    osm_id: 25996520,
    osm_key: 'aeroway',
    osm_value: 'aerodrome',
    type: 'house',
    name: 'Flughafen Wien-Schwechat',
    city: 'Schwechat',
    state: 'Niederösterreich',
    country: 'Österreich',
    countrycode: 'AT',
  },
};
const silves = {
  geometry: { coordinates: [-8.3487311, 37.2639826] as [number, number] },
  properties: {
    osm_type: 'R',
    osm_id: 5400890,
    osm_key: 'boundary',
    osm_value: 'administrative',
    type: 'city',
    name: 'Silves',
    country: 'Portugal',
    countrycode: 'PT',
  },
};

function photonReturning(body: unknown, status = 200) {
  const fetch = vi.fn<(url: URL, init?: RequestInit) => Promise<Response>>(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  );
  const provider = createPhotonProvider({
    baseUrl: 'https://photon.example',
    userAgent: 'tests',
    fetch: fetch as unknown as typeof globalThis.fetch,
  });
  return { provider, fetch };
}

describe('placeFromPhoton', () => {
  it('turns features into places with a kind for the suggestion list', () => {
    expect(placeFromPhoton(airport)).toEqual({
      id: 'photon:W25996520',
      name: 'Flughafen Wien-Schwechat',
      lngLat: [16.5848987, 48.1049968],
      kind: 'airport',
      source: 'search',
      city: 'Schwechat',
      state: 'Niederösterreich',
      country: 'Österreich',
      countryCode: 'AT',
    });
    expect(placeFromPhoton(silves).kind).toBe('locality');
    expect(PlaceSchema.safeParse(placeFromPhoton(silves)).success).toBe(true);
  });

  it('tells stations, addresses, streets and regions apart', () => {
    const kind = (properties: Record<string, string | number>) =>
      placeFromPhoton({ geometry: silves.geometry, properties }).kind;
    expect(
      kind({ osm_key: 'railway', osm_value: 'station', type: 'house', name: 'Wien Hbf' }),
    ).toBe('station');
    expect(kind({ osm_key: 'place', osm_value: 'house', type: 'house', housenumber: '7' })).toBe(
      'address',
    );
    expect(kind({ osm_key: 'highway', osm_value: 'primary', type: 'street', name: 'Ring' })).toBe(
      'street',
    );
    expect(kind({ osm_key: 'place', osm_value: 'state', type: 'state', name: 'Algarve' })).toBe(
      'region',
    );
    expect(kind({ osm_key: 'place', osm_value: 'town', type: 'city', name: 'Silves' })).toBe(
      'locality',
    );
    expect(kind({ osm_key: 'boundary', osm_value: 'x', type: 'county', name: 'Faro' })).toBe(
      'region',
    );
    expect(kind({ osm_key: 'amenity', osm_value: 'library', type: 'house', name: 'Arquivo' })).toBe(
      'poi',
    );
  });

  it('names an address without a name by its street and number', () => {
    const place = placeFromPhoton({
      geometry: silves.geometry,
      properties: { osm_key: 'place', osm_value: 'house', street: 'Rua Nova', housenumber: '3' },
    });
    expect(place.name).toBe('Rua Nova 3');
  });
});

describe('createPhotonProvider', () => {
  it('asks for the text near the bias, in the requested language, and says who asks', async () => {
    const { provider, fetch } = photonReturning({ features: [silves] });
    const places = await provider.search({
      text: 'silves',
      lang: 'de',
      limit: 8,
      bias: { lngLat: [-8.4, 37.2], zoom: 9 },
    });

    expect(places.map((place) => place.name)).toEqual(['Silves']);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url.origin + url.pathname).toBe('https://photon.example/api');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'silves',
      lang: 'de',
      limit: '8',
      lon: '-8.4',
      lat: '37.2',
      zoom: '9',
    });
    expect(new Headers(init?.headers).get('User-Agent')).toBe('tests');
  });

  it('looks up the place at a point', async () => {
    const { provider, fetch } = photonReturning({ features: [silves] });
    expect((await provider.reverse([-8.44, 37.19], 'de'))?.name).toBe('Silves');
    expect(fetch.mock.calls[0]![0].pathname).toBe('/reverse');
    const { provider: empty } = photonReturning({ features: [] });
    expect(await empty.reverse([0, 0], 'de')).toBeUndefined();
  });

  it('reports a throttled or broken service as unavailable', async () => {
    const { provider } = photonReturning({ message: 'slow down' }, 429);
    await expect(provider.search({ text: 'x', lang: 'de', limit: 8 })).rejects.toBeInstanceOf(
      GeocodingUnavailableError,
    );
    const { provider: odd } = photonReturning({ unexpected: true });
    await expect(odd.search({ text: 'x', lang: 'de', limit: 8 })).rejects.toThrow(/unexpected/);
  });

  it('reports a network failure as unavailable, but passes on a cancellation', async () => {
    const failing = createPhotonProvider({
      baseUrl: 'https://photon.example',
      userAgent: 'tests',
      fetch: () => Promise.reject(new TypeError('fetch failed')),
    });
    await expect(failing.search({ text: 'x', lang: 'de', limit: 8 })).rejects.toBeInstanceOf(
      GeocodingUnavailableError,
    );

    const controller = new AbortController();
    controller.abort();
    const cancelled = createPhotonProvider({
      baseUrl: 'https://photon.example',
      userAgent: 'tests',
      fetch: (_url, init) => Promise.reject(init?.signal?.reason as Error),
    });
    await expect(
      cancelled.search({ text: 'x', lang: 'de', limit: 8 }, controller.signal),
    ).rejects.not.toBeInstanceOf(GeocodingUnavailableError);
  });
});
