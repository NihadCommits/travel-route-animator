import { join } from 'node:path';
import type { Place, RouterId, RouteShape } from '@travel-route-animator/core';
import Fastify, { type FastifyInstance } from 'fastify';
import { createAirportStore } from './airports/airportStore';
import { registerAirportRoutes } from './airports/routes';
import { createFileCache } from './lib/fileCache';
import { createGeocoder } from './geocoding/geocoder';
import { GeocodingUnavailableError, type GeocodingProvider } from './geocoding/provider';
import { registerGeocodingRoutes } from './geocoding/routes';
import { createThrottle } from './lib/throttle';
import { createProjectStore } from './projects/projectStore';
import { registerProjectRoutes } from './projects/routes';
import { createRenderQueue } from './render/queue';
import { noRenderer, type StageRenderer } from './render/renderer';
import type { RevealFile } from './render/reveal';
import { registerRenderRoutes } from './render/routes';
import type { RoutingProvider } from './routing/provider';
import { createRouter } from './routing/router';
import { registerRoutingRoutes } from './routing/routes';

export interface AppOptions {
  dataDir: string;
  logger?: boolean;
  now?: () => Date;
  /** The place search behind /api/geocode; index.ts passes Photon, tests a fake. */
  geocodingProvider?: GeocodingProvider;
  /** Minimum time between two requests to the place search (fair use: one per second). */
  geocodingIntervalMs?: number;
  /** The routers behind /api/route; index.ts passes openrouteservice and OSRM, tests fakes. */
  routingProviders?: Partial<Record<RouterId, RoutingProvider>>;
  /** Minimum time between two requests per router (ORS: 40 per minute, OSRM: one per second). */
  routingIntervalsMs?: Record<RouterId, number>;
  /** Where rendered videos go; index.ts reads OUTPUT_DIR. */
  outputDir?: string;
  /** Renders the jobs; index.ts passes Remotion, tests a fake. Without one, jobs fail. */
  renderer?: StageRenderer;
  /** "Ordner öffnen"; index.ts passes Explorer. Without one the editor offers the path. */
  revealFile?: RevealFile;
}

const GEOCODE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Roads change slowly, and the route is stored in the project anyway; the cache mostly saves
// requests on undo, redo and for the same trip in another project.
const ROUTE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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
  routingProviders = {},
  routingIntervalsMs = { ors: 1500, osrm: 1000 },
  outputDir = join(dataDir, 'output'),
  renderer = noRenderer,
  revealFile = () => false,
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

  const router = createRouter({
    providers: routingProviders,
    cache: createFileCache<RouteShape>({
      dir: join(dataDir, 'cache', 'routes'),
      ttlMs: ROUTE_CACHE_TTL_MS,
      ...(now && { now }),
    }),
    throttles: {
      ors: createThrottle(routingIntervalsMs.ors),
      osrm: createThrottle(routingIntervalsMs.osrm),
    },
    log: (message) => app.log.info(message),
  });
  registerRoutingRoutes(app, router, now ?? (() => new Date()));

  const renderQueue = createRenderQueue({ renderer, ...(now && { now }) });
  registerRenderRoutes(app, {
    queue: renderQueue,
    store,
    outputDir,
    now: now ?? (() => new Date()),
    revealFile,
  });

  return app;
}
