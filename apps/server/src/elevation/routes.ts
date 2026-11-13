import { ElevationRequestSchema, toValidationIssues } from '@travel-route-animator/core';
import type { FastifyInstance } from 'fastify';
import { abortOnDisconnect } from '../lib/abortOnDisconnect';
import { ElevationUnavailableError } from './demTiles';
import type { ElevationSampler } from './sampler';

/** Without terrain tiles (tests, or no network on purpose) heights are simply not available. */
export const noElevation: ElevationSampler = {
  sample: () => Promise.reject(new ElevationUnavailableError('No terrain tiles are configured')),
};

export function registerElevationRoutes(app: FastifyInstance, sampler: ElevationSampler): void {
  void app.register((routes, _options, done) => {
    routes.setErrorHandler((error, _request, reply) => {
      if (error instanceof ElevationUnavailableError) {
        return reply.code(502).send({ error: 'unavailable', message: error.message });
      }
      return reply.send(error);
    });

    /** Heights along a route, as the RouteElevation the editor stores in `computed`. */
    routes.post('/api/elevation', async (request, reply) => {
      const parsed = ElevationRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'invalid_request',
          message: 'Expected {"line": [[lng, lat] …], "stepM"?}',
          issues: toValidationIssues(parsed.error),
        });
      }
      const { line, stepM } = parsed.data;
      return sampler.sample(line, stepM, abortOnDisconnect(reply));
    });

    done();
  });
}
