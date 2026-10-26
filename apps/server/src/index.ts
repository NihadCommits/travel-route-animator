import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildApp } from './app';
import { resolveDataDir, resolveListenOptions, resolveServiceConfig } from './config';
import { createPhotonProvider } from './geocoding/photon';
import { createOrsProvider } from './routing/ors';
import { createOsrmProvider } from './routing/osrm';

// .env and data/ live in the repo root, but pnpm starts this script inside apps/server.
const repoRoot = resolve(import.meta.dirname, '../../..');
const envFile = resolve(repoRoot, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const services = resolveServiceConfig(process.env);
const app = buildApp({
  logger: true,
  dataDir: resolveDataDir(process.env, repoRoot),
  geocodingProvider: createPhotonProvider({
    baseUrl: services.photonUrl,
    userAgent: services.userAgent,
  }),
  routingProviders: {
    ...(services.orsApiKey && {
      ors: createOrsProvider({
        apiKey: services.orsApiKey,
        baseUrl: services.orsUrl,
        userAgent: services.userAgent,
        // Only called during a request, when `app` exists. The key itself is never logged.
        onQuota: (remaining, limit) =>
          app.log.info(`openrouteservice quota: ${remaining} of ${limit} left`),
      }),
    }),
    osrm: createOsrmProvider({ baseUrl: services.osrmUrl, userAgent: services.userAgent }),
  },
});
if (!services.orsApiKey) {
  app.log.warn('ORS_API_KEY is not set: road routes need it (see .env.example)');
}

try {
  await app.listen(resolveListenOptions(process.env));
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
