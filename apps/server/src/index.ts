import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildApp } from './app';
import {
  resolveDataDir,
  resolveListenOptions,
  resolveOutputDir,
  resolveRenderConfig,
  resolveServiceConfig,
} from './config';
import { createPhotonProvider } from './geocoding/photon';
import { removePartialVideos } from './render/outputFiles';
import { createRemotionRenderer } from './render/remotionRenderer';
import { revealInExplorer } from './render/reveal';
import { createOrsProvider } from './routing/ors';
import { createOsrmProvider } from './routing/osrm';

// .env and data/ live in the repo root, but pnpm starts this script inside apps/server.
const repoRoot = resolve(import.meta.dirname, '../../..');
const envFile = resolve(repoRoot, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const services = resolveServiceConfig(process.env);
const renderConfig = resolveRenderConfig(process.env);
const outputDir = resolveOutputDir(process.env, repoRoot);
// Only called during a request or after start-up, when `app` exists.
const renderer = createRemotionRenderer({
  gl: renderConfig.gl,
  log: (message) => app.log.info(message),
});
const app = buildApp({
  logger: true,
  dataDir: resolveDataDir(process.env, repoRoot),
  outputDir,
  renderer,
  revealFile: revealInExplorer,
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

// Videos that were still being rendered when the server last stopped are no videos.
for (const path of await removePartialVideos(outputDir)) {
  app.log.info(`Removed the unfinished video ${path}`);
}

try {
  await app.listen(resolveListenOptions(process.env));
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

// In the background, so the server answers at once; the first render waits for it if needed.
if (renderConfig.prepareOnStart) {
  renderer.prepare().catch((error: unknown) => {
    app.log.warn(`Could not bundle the scene for rendering: ${String(error)}`);
  });
}
