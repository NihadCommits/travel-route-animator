import type {
  LngLat,
  RoadAvoid,
  RouteFailureKind,
  RouterId,
  RouteShape,
} from '@travel-route-animator/core';

/** What a router is asked for; the routing modes of the data model mapped to router terms. */
export type RoutingProfile = 'driving' | 'cycling' | 'walking' | 'hiking';

export interface RouterRequest {
  points: LngLat[];
  profile: RoutingProfile;
  /** Only for driving; a router that cannot avoid anything ignores it. */
  avoid: RoadAvoid[];
}

/**
 * A routing service. openrouteservice and OSRM are the first two; another router (or a
 * self-hosted one) can take their place without touching routes or the editor
 * (ARCHITEKTUR: "Datenquellen").
 */
export interface RoutingProvider {
  readonly name: RouterId;
  /** One leg per pair of consecutive points, each starting where the previous one ended. */
  route: (request: RouterRequest, signal?: AbortSignal) => Promise<RouteShape>;
}

/** No route, and why, in the terms the editor explains to the user (see core/routing/request). */
export class RoutingError extends Error {
  constructor(
    readonly kind: RouteFailureKind,
    message: string,
    readonly waypointIndex?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'RoutingError';
  }
}

/** fetch with a timeout; a network failure becomes "unavailable", a cancel stays a cancel. */
export async function fetchRouter(
  fetch: typeof globalThis.fetch,
  url: URL,
  init: RequestInit,
  { timeoutMs, signal, label }: { timeoutMs: number; signal?: AbortSignal; label: string },
): Promise<Response> {
  const timeout = AbortSignal.timeout(timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new RoutingError('unavailable', `${label} is not reachable (${url.host})`, undefined, {
      cause: error,
    });
  }
}

/** Joins two pieces of a line that meet in one point, without storing that point twice. */
export function appendLine(line: LngLat[], piece: readonly (readonly number[])[]): void {
  for (const [lng, lat] of piece) {
    if (lng === undefined || lat === undefined) continue;
    const last = line.at(-1);
    if (last && last[0] === lng && last[1] === lat) continue;
    line.push([lng, lat]);
  }
}
