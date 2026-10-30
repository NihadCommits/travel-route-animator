import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  resolveDataDir,
  resolveListenOptions,
  resolveOutputDir,
  resolveRenderConfig,
  resolveServiceConfig,
} from './config';
import { revealInExplorer } from './render/reveal';
import { startServer } from './start';

// .env and data/ live in the repo root, but pnpm starts this script inside apps/server.
const repoRoot = resolve(import.meta.dirname, '../../..');
const envFile = resolve(repoRoot, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

try {
  await startServer({
    dataDir: resolveDataDir(process.env, repoRoot),
    outputDir: resolveOutputDir(process.env, repoRoot),
    services: resolveServiceConfig(process.env),
    render: resolveRenderConfig(process.env),
    listen: resolveListenOptions(process.env),
    revealFile: revealInExplorer,
  });
} catch (error) {
  console.error(error);
  process.exit(1);
}
