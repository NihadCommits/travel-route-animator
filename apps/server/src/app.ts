import Fastify, { type FastifyInstance } from 'fastify';

export function buildApp(options: { logger?: boolean } = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });

  app.get('/api/health', () => ({ status: 'ok' }));

  return app;
}
