import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildApp } from './app';
import { resolveDataDir, resolveListenOptions } from './config';

// .env and data/ live in the repo root, but pnpm starts this script inside apps/server.
const repoRoot = resolve(import.meta.dirname, '../../..');
const envFile = resolve(repoRoot, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const app = buildApp({ logger: true, dataDir: resolveDataDir(process.env, repoRoot) });

try {
  await app.listen(resolveListenOptions(process.env));
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
