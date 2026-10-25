import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildApp } from './app';
import { resolveDataDir, resolveListenOptions, resolveServiceConfig } from './config';
import { createPhotonProvider } from './geocoding/photon';

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
});

try {
  await app.listen(resolveListenOptions(process.env));
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
