import type { LngLat } from '@travel-route-animator/core';
import { z } from 'zod';
import {
  appendLine,
  fetchRouter,
  RoutingError,
  type RoutingProfile,
  type RoutingProvider,
} from './provider';

// The FOSSGIS server runs one OSRM per profile; the profile segment in the path after
// /route/v1/ is ignored there, so it stays "driving" for all of them.
const PROFILES: Record<RoutingProfile, string> = {
  driving: 'routed-car',
  cycling: 'routed-bike',
  walking: 'routed-foot',
  hiking: 'routed-foot',
};

const OsrmResponse = z.object({
  code: z.string(),
  message: z.string().optional(),
  routes: z
    .array(
      z.object({
        legs: z.array(
          z.object({
            distance: z.number(),
            duration: z.number(),
            steps: z.array(
              z.object({ geometry: z.object({ coordinates: z.array(z.array(z.number())) }) }),
            ),
          }),
        ),
      }),
    )
    .optional(),
});

export interface OsrmOptions {
  baseUrl?: string;
  userAgent: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

/**
 * OSRM on the FOSSGIS routing server (routing.openstreetmap.de), the way out when
 * openrouteservice is down or its quota is used up. Its usage policy: at most one request per
 * second, a real User-Agent, attribution. It knows no "avoid", so that is left out.
 */
export function createOsrmProvider({
  baseUrl = 'https://routing.openstreetmap.de',
  userAgent,
  timeoutMs = 15_000,
  fetch = globalThis.fetch,
}: OsrmOptions): RoutingProvider {
  return {
    name: 'osrm',
    async route({ points, profile }, signal) {
      const coordinates = points.map(([lng, lat]) => `${lng},${lat}`).join(';');
      const url = new URL(
        `${PROFILES[profile]}/route/v1/driving/${coordinates}`,
        baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`,
      );
      // Steps instead of the overview line: they come per leg, so the leg boundaries are known.
      url.search = new URLSearchParams({
        overview: 'false',
        steps: 'true',
        geometries: 'geojson',
        alternatives: 'false',
      }).toString();
      const response = await fetchRouter(
        fetch,
        url,
        { headers: { 'User-Agent': userAgent, Accept: 'application/json' } },
        { timeoutMs, label: 'OSRM', ...(signal && { signal }) },
      );
      if (response.status === 429) throw new RoutingError('quota', 'OSRM asks to slow down');

      const parsed = OsrmResponse.safeParse(await response.json().catch(() => undefined));
      if (!parsed.success) {
        throw new RoutingError('unavailable', `OSRM answered ${response.status} unexpectedly`);
      }
      const { code, message = code, routes } = parsed.data;
      if (code === 'NoRoute') throw new RoutingError('no_route', message);
      if (code === 'NoSegment') throw new RoutingError('point_not_found', message);
      if (code === 'TooBig') throw new RoutingError('too_long', message);
      const [route] = routes ?? [];
      if (code !== 'Ok' || !route) throw new RoutingError('unavailable', `OSRM: ${message}`);
      if (route.legs.length !== points.length - 1) {
        throw new RoutingError('unavailable', 'OSRM answered for other points');
      }

      return {
        provider: 'osrm',
        legs: route.legs.map((leg) => {
          const line: LngLat[] = [];
          for (const step of leg.steps) appendLine(line, step.geometry.coordinates);
          return { line, distanceM: leg.distance, durationS: leg.duration };
        }),
      };
    },
  };
}
