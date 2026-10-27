import type { LngLat, RoadAvoid } from '@travel-route-animator/core';
import { z } from 'zod';
import {
  appendLine,
  fetchRouter,
  RoutingError,
  type RoutingProfile,
  type RoutingProvider,
} from './provider';

const PROFILES: Record<RoutingProfile, string> = {
  driving: 'driving-car',
  cycling: 'cycling-regular',
  walking: 'foot-walking',
  hiking: 'foot-hiking',
};

const AVOID: Record<RoadAvoid, string> = {
  highways: 'highways',
  tolls: 'tollways',
  ferries: 'ferries',
};

// Only what we read from the GeoJSON answer of /v2/directions/{profile}/geojson.
const OrsResponse = z.object({
  features: z
    .array(
      z.object({
        geometry: z.object({ coordinates: z.array(z.array(z.number()).min(2)) }),
        properties: z.object({
          /** Index in the geometry of each requested point. */
          way_points: z.array(z.number().int().min(0)),
          /** One per pair of consecutive points, distance in m and duration in s. */
          segments: z.array(z.object({ distance: z.number(), duration: z.number() })),
        }),
      }),
    )
    .min(1),
});

const OrsError = z.object({ error: z.object({ code: z.number(), message: z.string() }) });

export interface OrsOptions {
  apiKey: string;
  baseUrl?: string;
  userAgent: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
  /** Remaining requests of the key's quota, from the answer's rate limit headers. */
  onQuota?: (remaining: number, limit: number) => void;
}

/** openrouteservice Directions V2 (https://openrouteservice.org, free standard key). */
export function createOrsProvider({
  apiKey,
  baseUrl = 'https://api.openrouteservice.org',
  userAgent,
  timeoutMs = 15_000,
  fetch = globalThis.fetch,
  onQuota,
}: OrsOptions): RoutingProvider {
  return {
    name: 'ors',
    async route({ points, profile, avoid }, signal) {
      const url = new URL(`v2/directions/${PROFILES[profile]}/geojson`, withSlash(baseUrl));
      const body = {
        coordinates: points,
        // Only with instructions does the answer carry `segments`, the distance and duration
        // per leg. The turn-by-turn steps that come along are ignored.
        instructions: true,
        ...(profile === 'driving' &&
          avoid.length > 0 && { options: { avoid_features: avoid.map((a) => AVOID[a]) } }),
      };
      const response = await fetchRouter(
        fetch,
        url,
        {
          method: 'POST',
          headers: {
            Authorization: apiKey,
            'Content-Type': 'application/json',
            Accept: 'application/geo+json, application/json',
            'User-Agent': userAgent,
          },
          body: JSON.stringify(body),
        },
        { timeoutMs, label: 'openrouteservice', ...(signal && { signal }) },
      );
      reportQuota(response, onQuota);

      const json: unknown = await response.json().catch(() => undefined);
      if (!response.ok) throw orsFailure(response.status, json);
      const parsed = OrsResponse.safeParse(json);
      if (!parsed.success) {
        throw new RoutingError('unavailable', 'openrouteservice sent an unexpected answer');
      }
      const [feature] = parsed.data.features;
      const { way_points: wayPoints, segments } = feature!.properties;
      if (wayPoints.length !== points.length || segments.length !== points.length - 1) {
        throw new RoutingError('unavailable', 'openrouteservice answered for other points');
      }
      const coordinates = feature!.geometry.coordinates;
      return {
        provider: 'ors',
        legs: segments.map((segment, i) => {
          const line: LngLat[] = [];
          appendLine(line, coordinates.slice(wayPoints[i], wayPoints[i + 1]! + 1));
          return { line, distanceM: segment.distance, durationS: segment.duration };
        }),
      };
    },
  };
}

/** Error codes from the openrouteservice documentation ("Error Codes", Routing API). */
function orsFailure(status: number, json: unknown): RoutingError {
  if (status === 401 || status === 403) {
    return new RoutingError('key_rejected', 'openrouteservice did not accept the API key');
  }
  if (status === 429) return new RoutingError('quota', 'openrouteservice quota is used up');
  const error = OrsError.safeParse(json);
  if (!error.success) {
    return new RoutingError('unavailable', `openrouteservice answered ${status}`);
  }
  const { code, message } = error.data.error;
  switch (code) {
    case 2010: {
      // "Could not find routable point within a radius of 350.0 meters of specified coordinate 1: …"
      const index = /coordinate (\d+)/.exec(message)?.[1];
      return new RoutingError('point_not_found', message, index ? Number(index) : undefined);
    }
    case 2009:
      return new RoutingError('no_route', message);
    case 2004:
      return new RoutingError('too_long', message);
    default:
      return new RoutingError('unavailable', `openrouteservice error ${code}: ${message}`);
  }
}

function reportQuota(response: Response, onQuota: OrsOptions['onQuota']) {
  const remaining = Number(response.headers.get('x-ratelimit-remaining'));
  const limit = Number(response.headers.get('x-ratelimit-limit'));
  if (onQuota && response.headers.has('x-ratelimit-remaining') && Number.isFinite(remaining)) {
    onQuota(remaining, limit);
  }
}

const withSlash = (url: string) => (url.endsWith('/') ? url : `${url}/`);
