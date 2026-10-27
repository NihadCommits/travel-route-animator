import { z } from 'zod';
import { WaypointKindSchema } from '../model/enums';
import { IdSchema, LngLatSchema } from '../model/primitives';
import { RoutingSettingsSchema, type Track } from '../model/track';

// The contract of POST /api/route between editor and server. Not part of the project file:
// the answer is a ComputedRoute, which the editor stores in the track.

/** The routers behind the server: openrouteservice first, the FOSSGIS OSRM as a way out. */
export const RouterIdSchema = z.enum(['ors', 'osrm']);
export type RouterId = z.infer<typeof RouterIdSchema>;

/** openrouteservice takes at most 50 waypoints per route. */
export const MAX_ROUTE_WAYPOINTS = 50;

export const RouteRequestSchema = z.strictObject({
  waypoints: z
    .array(z.strictObject({ id: IdSchema, lngLat: LngLatSchema, kind: WaypointKindSchema }))
    .min(2)
    .max(MAX_ROUTE_WAYPOINTS),
  routing: RoutingSettingsSchema,
  /** Missing: openrouteservice. */
  router: RouterIdSchema.optional(),
});
export type RouteRequest = z.infer<typeof RouteRequestSchema>;

/**
 * Why there is no route, as the editor explains it. Only `unavailable`, `quota`, `no_key` and
 * `key_rejected` are worth trying with the other router; the rest are about the waypoints.
 */
export const RouteFailureKindSchema = z.enum([
  /** The router found no way between two waypoints (an island, a closed area). */
  'no_route',
  /** A waypoint is too far from any road or path; `waypointIndex` says which. */
  'point_not_found',
  /** Longer or with more points than the router takes (openrouteservice: 6,000 km, 50 points). */
  'too_long',
  /** The free quota is used up for now. */
  'quota',
  /** The router could not be reached or answered with an error. */
  'unavailable',
  /** ORS_API_KEY is missing in .env. */
  'no_key',
  /** openrouteservice did not accept the key. */
  'key_rejected',
]);
export type RouteFailureKind = z.infer<typeof RouteFailureKindSchema>;

export const RouteFailureSchema = z.object({
  error: RouteFailureKindSchema,
  message: z.string(),
  waypointIndex: z.number().int().min(0).optional(),
});
export type RouteFailure = z.infer<typeof RouteFailureSchema>;

/** Only what the route depends on goes to the server, not names, holds or styles. */
export function toRouteRequest(
  track: Pick<Track, 'waypoints' | 'routing'>,
  router: RouterId,
): RouteRequest {
  return {
    waypoints: track.waypoints.map(({ id, lngLat, kind }) => ({ id, lngLat, kind })),
    routing: track.routing,
    ...(router !== 'ors' && { router }),
  };
}
