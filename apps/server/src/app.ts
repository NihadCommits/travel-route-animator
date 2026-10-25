import { join } from 'node:path';
import type { Place } from '@travel-route-animator/core';
import Fastify, { type FastifyInstance } from 'fastify';
import { createAirportStore } from './airports/airportStore';
import { registerAirportRoutes } from './airports/routes';
import { createFileCache } from './geocoding/fileCache';
import { createGeocoder } from './geocoding/geocoder';
import { GeocodingUnavailableError, type GeocodingProvider } from './geocoding/provider';
import { registerGeocodingRoutes } from './geocoding/routes';
import { createThrottle } from './geocoding/throttle';
import { createProjectStore } from './projects/projectStore';
import { registerProjectRoutes } from './projects/routes';

export interface AppOptions {
  dataDir: string;
  logger?: boolean;
  now?: () => Date;
  /** The place search behind /api/geocode; index.ts passes Photon, tests a fake. */
  geocodingProvider?: GeocodingProvider;
  /** Minimum time between two requests to the place search (fair use: one per second). */
  geocodingIntervalMs?: number;
}

const GEOCODE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Without a configured provider nothing may leave the machine, e.g. in tests.
const noGeocoding: GeocodingProvider = {
  name: 'none',
  search: () => Promise.reject(new GeocodingUnavailableError('No place search is configured')),
  reverse: () => Promise.reject(new GeocodingUnavailableError('No place search is configured')),
};

export function buildApp({
  dataDir,
  logger = false,
  now,
  geocodingProvider = noGeocoding,
  geocodingIntervalMs = 1000,
}: AppOptions): FastifyInstance {
  const app = Fastify({
    logger,
    // Projects carry computed route geometry; the default 1 MB limit is too tight for long trips.
    bodyLimit: 10 * 1024 * 1024,
  });

  app.get('/api/health', () => ({ status: 'ok' }));

  const store = createProjectStore({
    dataDir,
    ...(now && { now }),
    warn: (message) => app.log.warn(message),
  });
  registerProjectRoutes(app, store);

  const airports = createAirportStore(dataDir);
  registerAirportRoutes(app, airports);

  const geocoder = createGeocoder({
    provider: geocodingProvider,
    cache: createFileCache<Place[]>({
      dir: join(dataDir, 'cache', 'geocode'),
      ttlMs: GEOCODE_CACHE_TTL_MS,
      ...(now && { now }),
    }),
    throttle: createThrottle(geocodingIntervalMs),
    log: (message) => app.log.info(message),
    airports: () => airports.index(),
  });
  registerGeocodingRoutes(app, geocoder);

  return app;
}
