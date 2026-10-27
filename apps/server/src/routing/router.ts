import type { RouteInput, RouterId, RouteShape, RoutingMode } from '@travel-route-animator/core';
import type { FileCache } from '../lib/fileCache';
import type { Throttle } from '../lib/throttle';
import { RoutingError, type RoutingProfile, type RoutingProvider } from './provider';

const PROFILE_OF: Partial<Record<RoutingMode, RoutingProfile>> = {
  road: 'driving',
  cycling: 'cycling',
  walking: 'walking',
  hiking: 'hiking',
};

/** The router profile for a routing mode; undefined for modes core computes itself. */
export function routingProfileOf(mode: RoutingMode): RoutingProfile | undefined {
  return PROFILE_OF[mode];
}

export interface RouterOptions {
  /** openrouteservice is missing without ORS_API_KEY; OSRM needs no key. */
  providers: Partial<Record<RouterId, RoutingProvider>>;
  cache: FileCache<RouteShape>;
  /** One queue per service, each with its own fair-use interval. */
  throttles: Record<RouterId, Throttle>;
  log: (message: string) => void;
}

export type Router = ReturnType<typeof createRouter>;

// Six decimals as in the stored route: a point moved by less than 10 cm is the same request.
const round = (value: number) => Math.round(value * 1e6) / 1e6;

/** Road, cycling and walking routes with cache and throttling in front of the router. */
export function createRouter({ providers, cache, throttles, log }: RouterOptions) {
  return {
    async route(input: RouteInput, router: RouterId, signal?: AbortSignal): Promise<RouteShape> {
      const profile = routingProfileOf(input.routing.mode);
      if (!profile) throw new RangeError(`"${input.routing.mode}" is not routed by a router`);
      const provider = providers[router];
      if (!provider) {
        throw router === 'ors'
          ? new RoutingError('no_key', 'ORS_API_KEY is not set in .env')
          : new RoutingError('unavailable', `${router} is not configured`);
      }

      // Only what changes the answer: no IDs and no stop/shape, so switching a point between
      // stop and shape point (a new input hash) costs no request. OSRM ignores "avoid".
      const avoid =
        router === 'ors' && profile === 'driving'
          ? [...new Set(input.routing.avoid ?? [])].sort()
          : [];
      const points = input.waypoints.map(({ lngLat: [lng, lat] }) => [round(lng), round(lat)]);
      const key = JSON.stringify({ router, profile, avoid, points });
      const label = `${profile}, ${points.length} points`;

      const hit = await cache.get(key);
      if (hit) {
        log(`route cache hit (${router}): ${label}`);
        return hit;
      }
      log(`route → ${router}: ${label}`);
      const shape = await throttles[router](
        () =>
          provider.route({ points: input.waypoints.map((w) => w.lngLat), profile, avoid }, signal),
        signal,
      );
      await cache.set(key, shape);
      return shape;
    },
  };
}
