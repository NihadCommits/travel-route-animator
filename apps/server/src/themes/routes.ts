import type { FastifyInstance, FastifyRequest } from 'fastify';
import { SatelliteUnavailableError, type SatelliteSource } from '../tiles/satellite';
import { ThemeInvalidError, ThemeNotFoundError, type ThemeStore } from './themeStore';

// Map looks (ADR 0010): own themes, satellite tiles and what this server can offer.

interface IdParams {
  id: string;
}

/**
 * This server's own address, as a page that is not the editor reaches it: the render page
 * loads satellite tiles from here. The socket knows it, also behind Vite's proxy.
 */
export function ownUrl(request: FastifyRequest): string {
  const { localAddress, localPort } = request.socket;
  const host = localAddress?.includes(':') ? `[${localAddress}]` : (localAddress ?? '127.0.0.1');
  return `http://${host}:${localPort}`;
}

export function registerMapRoutes(
  app: FastifyInstance,
  { themes, satellite }: { themes: ThemeStore; satellite: SatelliteSource | undefined },
): void {
  void app.register((routes, _options, done) => {
    routes.setErrorHandler((error, _request, reply) => {
      if (error instanceof ThemeNotFoundError) {
        return reply.code(404).send({ error: 'not_found', message: error.message });
      }
      if (error instanceof ThemeInvalidError) {
        return reply
          .code(400)
          .send({ error: 'invalid_theme', message: error.message, issues: error.issues });
      }
      if (error instanceof SatelliteUnavailableError) {
        return reply.code(502).send({ error: 'satellite_unavailable', message: error.message });
      }
      return reply.send(error);
    });

    routes.get('/api/capabilities', () => ({ satellite: satellite !== undefined }));

    routes.get('/api/themes', () => themes.list());
    routes.get<{ Params: IdParams }>('/api/themes/:id', (request) => themes.get(request.params.id));
    routes.put<{ Params: IdParams }>('/api/themes/:id', (request) =>
      themes.put(request.params.id, request.body),
    );
    routes.delete<{ Params: IdParams }>('/api/themes/:id', async (request, reply) => {
      await themes.remove(request.params.id);
      return reply.code(204).send();
    });

    // The render page has an origin of its own (Remotion's), so tiles allow any origin. They
    // are pictures of the earth; the key that fetched them never leaves this server.
    const noKey = { error: 'no_key', message: 'MAPTILER_API_KEY is not set in .env' };
    routes.get('/api/tiles/satellite/tiles.json', async (request, reply) => {
      reply.header('access-control-allow-origin', '*');
      if (!satellite) return reply.code(503).send(noKey);
      return satellite.tileJson(ownUrl(request));
    });
    routes.get<{ Params: { z: string; x: string; y: string } }>(
      '/api/tiles/satellite/:z/:x/:y',
      async (request, reply) => {
        reply.header('access-control-allow-origin', '*');
        if (!satellite) return reply.code(503).send(noKey);
        const [z, x, y] = [request.params.z, request.params.x, request.params.y].map(Number);
        const valid = [z, x, y].every((n) => Number.isInteger(n) && n! >= 0) && z! <= 22;
        if (!valid || x! >= 2 ** z! || y! >= 2 ** z!) {
          return reply.code(400).send({ error: 'invalid_tile', message: 'No such tile' });
        }
        const { bytes, contentType } = await satellite.tile(z!, x!, y!);
        return reply
          .header('cache-control', 'private, max-age=604800')
          .type(contentType)
          .send(bytes);
      },
    );

    done();
  });
}
