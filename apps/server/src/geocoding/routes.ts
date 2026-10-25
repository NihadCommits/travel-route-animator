import { LngLatSchema, toValidationIssues, type LngLat } from '@travel-route-animator/core';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { Geocoder } from './geocoder';
import { GeocodingUnavailableError } from './provider';

const SEARCH_LIMIT = 8;

const Lang = z
  .string()
  .regex(/^[a-z]{2}$/, 'Expected a two-letter language code such as de')
  .default('de');

/** Checks with the same rules as every coordinate in the project, including the swap hint. */
function toLngLat(lng: number, lat: number, ctx: z.RefinementCtx): LngLat {
  const result = LngLatSchema.safeParse([lng, lat]);
  if (result.success) return result.data;
  ctx.addIssue({
    code: 'custom',
    message: result.error.issues[0]?.message ?? 'Invalid coordinate',
  });
  return z.NEVER;
}

/** "lng,lat,zoom", e.g. the centre and zoom of the visible map. Order as everywhere: lng first. */
const Bias = z.string().transform((text, ctx) => {
  const parts = text.split(',').map(Number);
  const [lng = NaN, lat = NaN, zoom = NaN] = parts;
  if (parts.length !== 3 || !(zoom >= 0 && zoom <= 24)) {
    ctx.addIssue({ code: 'custom', message: 'Expected bias as lng,lat,zoom' });
    return z.NEVER;
  }
  return { lngLat: toLngLat(lng, lat, ctx), zoom };
});

const GeocodeQuery = z.strictObject({
  q: z.string().trim().min(1, 'Expected a search text').max(200),
  lang: Lang,
  bias: Bias.optional(),
});

const ReverseQuery = z
  .strictObject({ lng: z.coerce.number(), lat: z.coerce.number(), lang: Lang })
  .transform(({ lng, lat, lang }, ctx) => ({ lngLat: toLngLat(lng, lat, ctx), lang }));

class InvalidQueryError extends Error {
  constructor(readonly issues: ReturnType<typeof toValidationIssues>) {
    super('The query is not valid');
  }
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new InvalidQueryError(toValidationIssues(result.error));
  return result.data;
}

/**
 * Fires when the browser gives up on the request (typing on cancels the previous search).
 * reply.raw, not request.raw: the request side closes as soon as its (empty) body is read.
 */
function abortOnDisconnect(reply: FastifyReply): AbortSignal {
  const controller = new AbortController();
  reply.raw.on('close', () => {
    if (!reply.raw.writableFinished) controller.abort();
  });
  return controller.signal;
}

export function registerGeocodingRoutes(app: FastifyInstance, geocoder: Geocoder): void {
  void app.register((routes, _options, done) => {
    routes.setErrorHandler((error, _request, reply) => {
      if (error instanceof InvalidQueryError) {
        return reply.code(400).send({
          error: 'invalid_request',
          message: error.message,
          issues: error.issues,
        });
      }
      if (error instanceof GeocodingUnavailableError) {
        return reply.code(502).send({ error: 'geocoding_unavailable', message: error.message });
      }
      return reply.send(error);
    });

    routes.get('/api/geocode', async (request, reply) => {
      const { q, lang, bias } = parse(GeocodeQuery, request.query);
      const places = await geocoder.search(
        { text: q, lang, bias, limit: SEARCH_LIMIT },
        abortOnDisconnect(reply),
      );
      return { places };
    });

    routes.get('/api/reverse', async (request, reply) => {
      const { lngLat, lang } = parse(ReverseQuery, request.query);
      const place = await geocoder.reverse(lngLat, lang, abortOnDisconnect(reply));
      return { place: place ?? null };
    });

    done();
  });
}
