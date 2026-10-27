import {
  assembleComputedRoute,
  computeLocalRoute,
  RouteRequestSchema,
  toValidationIssues,
  type RouteFailure,
  type RouteFailureKind,
} from '@travel-route-animator/core';
import type { FastifyInstance } from 'fastify';
import { abortOnDisconnect } from '../lib/abortOnDisconnect';
import { RoutingError } from './provider';
import { routingProfileOf, type Router } from './router';

/** 422 for problems with the waypoints, 429/502/503 for problems with the service. */
const STATUS: Record<RouteFailureKind, number> = {
  no_route: 422,
  point_not_found: 422,
  too_long: 422,
  quota: 429,
  unavailable: 502,
  no_key: 503,
  key_rejected: 503,
};

export function registerRoutingRoutes(app: FastifyInstance, router: Router, now: () => Date): void {
  void app.register((routes, _options, done) => {
    routes.setErrorHandler((error, _request, reply) => {
      if (error instanceof RoutingError) {
        const body: RouteFailure = {
          error: error.kind,
          message: error.message,
          ...(error.waypointIndex !== undefined && { waypointIndex: error.waypointIndex }),
        };
        return reply.code(STATUS[error.kind]).send(body);
      }
      return reply.send(error);
    });

    /** The route of one track, as the ComputedRoute the editor stores in it. */
    routes.post('/api/route', async (request, reply) => {
      const parsed = RouteRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'invalid_request',
          message: 'Expected {"waypoints": [{"id", "lngLat", "kind"} …], "routing": {"mode"}}',
          issues: toValidationIssues(parsed.error),
        });
      }
      const input = parsed.data;
      const computedAt = now().toISOString();

      // Planes, trains and ferries need no router; the editor computes them itself, but the
      // endpoint answers them too, so it is one contract for every mode.
      const local = computeLocalRoute(input, computedAt);
      if (local) return local;
      if (!routingProfileOf(input.routing.mode)) {
        return reply.code(400).send({
          error: 'invalid_request',
          message: `"${input.routing.mode}" routes come from an imported file, not from a router`,
        });
      }

      const shape = await router.route(input, input.router ?? 'ors', abortOnDisconnect(reply));
      return assembleComputedRoute(input, shape, computedAt);
    });

    done();
  });
}
