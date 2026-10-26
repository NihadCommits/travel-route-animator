import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { RoutingSettings, Track, Waypoint } from '../model/track';
import { canonicalJson } from './canonicalJson';

/** The parts of a waypoint a route depends on, plus its ID to tie the legs to it. */
export type RouteWaypoint = Pick<Waypoint, 'id' | 'lngLat' | 'kind'>;

/**
 * What a route is computed from: the waypoints and the routing settings of a track. A whole
 * Track fits; the editor sends only these fields to the server.
 */
export interface RouteInput {
  waypoints: readonly RouteWaypoint[];
  routing: RoutingSettings;
}

/**
 * Fingerprint of everything that changes the shape of a route: waypoint positions and kinds
 * plus the routing settings. Renaming a stop or changing its hold does not change it, so those
 * edits never trigger a new (rate-limited) routing request.
 *
 * SHA-256 in plain JS on purpose: core must not depend on node:crypto, and the Web Crypto API
 * is asynchronous.
 */
export function computeRouteInputHash(track: RouteInput): string {
  const payload = {
    routing: {
      mode: track.routing.mode,
      // Order and duplicates of "avoid" do not change the route.
      avoid: [...new Set(track.routing.avoid ?? [])].sort(),
    },
    waypoints: track.waypoints.map(({ lngLat, kind }) => ({ lngLat, kind })),
  };
  return bytesToHex(sha256(utf8ToBytes(canonicalJson(payload))));
}

/** True when there is no stored route or it was computed for different waypoints/settings. */
export function isRouteStale(track: RouteInput & Pick<Track, 'computed'>): boolean {
  return track.computed === undefined || track.computed.inputHash !== computeRouteInputHash(track);
}
