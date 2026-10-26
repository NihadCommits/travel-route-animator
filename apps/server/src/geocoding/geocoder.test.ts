import type { Place } from '@travel-route-animator/core';
import { describe, expect, it, vi } from 'vitest';
import type { FileCache } from '../lib/fileCache';
import { createGeocoder } from './geocoder';
import type { GeocodingProvider } from './provider';

const schwechat: Place = {
  id: 'photon:W1',
  name: 'Flughafen Wien-Schwechat',
  lngLat: [16.5849, 48.105],
  kind: 'airport',
  source: 'search',
};
const silves: Place = {
  id: 'photon:R1',
  name: 'Silves',
  lngLat: [-8.35, 37.26],
  kind: 'locality',
  source: 'search',
};

function setup({ airports = true } = {}) {
  const provider: GeocodingProvider = {
    name: 'fake',
    search: vi.fn(() => Promise.resolve([schwechat, silves])),
    reverse: vi.fn(() => Promise.resolve(silves)),
  };
  const store = new Map<string, Place[]>();
  const cache: FileCache<Place[]> = {
    get: (key) => Promise.resolve(store.get(key)),
    set: (key, value) => Promise.resolve(void store.set(key, value)),
  };
  const log = vi.fn<(message: string) => void>();
  const geocoder = createGeocoder({
    provider,
    cache,
    throttle: (task) => task(),
    log,
    ...(airports && {
      airports: () =>
        Promise.resolve({ codeNear: ([lng]: [number, number]) => (lng > 16 ? 'VIE' : undefined) }),
    }),
  });
  return { geocoder, provider, log };
}

const query = { text: 'Silves', lang: 'de', limit: 8 };

describe('createGeocoder', () => {
  it('answers a repeated search from the cache and says so in the log', async () => {
    const { geocoder, provider, log } = setup();
    await geocoder.search(query);
    await geocoder.search({ ...query, text: '  SILVES ' });

    expect(provider.search).toHaveBeenCalledTimes(1);
    expect(log.mock.calls.map(([message]) => message)).toEqual([
      'geocode → fake: "silves"',
      'geocode cache hit: "silves"',
    ]);
  });

  it('treats a slightly moved map as the same search', async () => {
    const { geocoder, provider } = setup();
    await geocoder.search({ ...query, bias: { lngLat: [-8.4012, 37.2033], zoom: 9.2 } });
    await geocoder.search({ ...query, bias: { lngLat: [-8.4048, 37.1981], zoom: 8.8 } });
    expect(provider.search).toHaveBeenCalledTimes(1);
    expect(provider.search).toHaveBeenCalledWith(
      { ...query, text: 'silves', bias: { lngLat: [-8.4, 37.2], zoom: 9 } },
      undefined,
    );

    await geocoder.search({ ...query, bias: { lngLat: [-8.6, 37.2], zoom: 9 } });
    expect(provider.search).toHaveBeenCalledTimes(2);
  });

  it('adds the IATA code to airports the place search found', async () => {
    const { geocoder } = setup();
    const [airport, town] = await geocoder.search(query);
    expect(airport?.airportCode).toBe('VIE');
    expect(town).not.toHaveProperty('airportCode');
  });

  it('still answers without airport data', async () => {
    const { geocoder } = setup({ airports: false });
    expect((await geocoder.search(query))[0]).not.toHaveProperty('airportCode');
  });

  it('caches the place at a clicked point to about ten metres', async () => {
    const { geocoder, provider } = setup();
    expect((await geocoder.reverse([-8.43851, 37.18892], 'de'))?.name).toBe('Silves');
    await geocoder.reverse([-8.43849, 37.18888], 'de');
    expect(provider.reverse).toHaveBeenCalledTimes(1);
    expect(provider.reverse).toHaveBeenCalledWith([-8.4385, 37.1889], 'de', undefined);
  });
});
