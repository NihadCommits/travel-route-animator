import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Place } from '@travel-route-animator/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app';
import { GeocodingUnavailableError, type GeocodingProvider } from './provider';

const silves: Place = {
  id: 'photon:R1',
  name: 'Silves',
  lngLat: [-8.35, 37.26],
  kind: 'locality',
  source: 'search',
};

describe('place search API', () => {
  let dataDir: string;
  let provider: GeocodingProvider;
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'tra-geocode-'));
    provider = {
      name: 'fake',
      search: vi.fn(() => Promise.resolve([silves])),
      reverse: vi.fn(() => Promise.resolve(silves)),
    };
    app = buildApp({ dataDir, geocodingProvider: provider, geocodingIntervalMs: 0 });
  });

  afterEach(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const get = (url: string) => app.inject({ method: 'GET', url });

  describe('GET /api/geocode', () => {
    it('finds places near the bias and keeps them in a file cache', async () => {
      const response = await get('/api/geocode?q=Silves&bias=-8.4,37.2,9');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ places: [silves] });
      expect(provider.search).toHaveBeenCalledWith(
        { text: 'silves', lang: 'de', limit: 8, bias: { lngLat: [-8.4, 37.2], zoom: 9 } },
        expect.any(AbortSignal),
      );

      // A new server (e.g. after a restart) still finds it in data/cache/geocode.
      await app.close();
      app = buildApp({ dataDir, geocodingProvider: provider, geocodingIntervalMs: 0 });
      expect((await get('/api/geocode?q=silves&bias=-8.4,37.2,9')).json()).toEqual({
        places: [silves],
      });
      expect(provider.search).toHaveBeenCalledTimes(1);
    });

    it('rejects an empty search and a bias in [lat, lng] order', async () => {
      expect((await get('/api/geocode?q=%20')).statusCode).toBe(400);
      const swapped = await get('/api/geocode?q=Wien&bias=48.2,116.37,9');
      expect(swapped.statusCode).toBe(400);
      expect(JSON.stringify(swapped.json())).toMatch(/\[lat, lng\]/);
      expect((await get('/api/geocode?q=Wien&bias=1,2')).statusCode).toBe(400);
    });

    it('says when the place search is unavailable', async () => {
      vi.mocked(provider.search).mockRejectedValueOnce(new GeocodingUnavailableError('down'));
      const response = await get('/api/geocode?q=Silves');
      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({ error: 'geocoding_unavailable' });
    });

    it('never asks a service unless one is configured', async () => {
      const offline = buildApp({ dataDir });
      const response = await offline.inject({ method: 'GET', url: '/api/geocode?q=Silves' });
      expect(response.statusCode).toBe(502);
      await offline.close();
    });
  });

  describe('GET /api/reverse', () => {
    it('names the place at a point', async () => {
      const response = await get('/api/reverse?lng=-8.4385&lat=37.1889');
      expect(response.json()).toEqual({ place: silves });
      expect(provider.reverse).toHaveBeenCalledWith(
        [-8.4385, 37.1889],
        'de',
        expect.any(AbortSignal),
      );
    });

    it('answers null where there is nothing, and rejects invalid points', async () => {
      vi.mocked(provider.reverse).mockResolvedValueOnce(undefined);
      expect((await get('/api/reverse?lng=0&lat=0')).json()).toEqual({ place: null });
      expect((await get('/api/reverse?lng=200&lat=0')).statusCode).toBe(400);
      expect((await get('/api/reverse?lng=abc&lat=0')).statusCode).toBe(400);
    });
  });
});
