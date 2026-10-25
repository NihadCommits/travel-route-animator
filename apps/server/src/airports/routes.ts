import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { placeFromAirport } from './airportData';
import { AirportDataMissingError, type AirportStore } from './airportStore';

const AirportQuery = z.strictObject({ q: z.string().trim().min(1).max(100) });

export function registerAirportRoutes(app: FastifyInstance, store: AirportStore): void {
  void app.register((routes, _options, done) => {
    routes.setErrorHandler((error, _request, reply) => {
      // 503: the search works once the data is there; the message says how to get it.
      if (error instanceof AirportDataMissingError) {
        return reply.code(503).send({ error: 'airports_missing', message: error.message });
      }
      return reply.send(error);
    });

    routes.get('/api/airports', async (request, reply) => {
      const query = AirportQuery.safeParse(request.query);
      if (!query.success) {
        return reply.code(400).send({ error: 'invalid_request', message: 'Expected q' });
      }
      const index = await store.index();
      return { places: index.search(query.data.q).map(placeFromAirport) };
    });

    done();
  });
}
