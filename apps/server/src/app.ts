import Fastify, { type FastifyInstance } from 'fastify';
import { createProjectStore } from './projects/projectStore';
import { registerProjectRoutes } from './projects/routes';

export interface AppOptions {
  dataDir: string;
  logger?: boolean;
  now?: () => Date;
}

export function buildApp({ dataDir, logger = false, now }: AppOptions): FastifyInstance {
  const app = Fastify({
    logger,
    // Projects carry computed route geometry; the default 1 MB limit is too tight for long trips.
    bodyLimit: 10 * 1024 * 1024,
  });

  app.get('/api/health', () => ({ status: 'ok' }));

  const store = createProjectStore({
    dataDir,
    ...(now && { now }),
    warn: (message) => app.log.warn(message),
  });
  registerProjectRoutes(app, store);

  return app;
}
