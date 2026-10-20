import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildApp } from './app';
import { resolveListenOptions } from './config';

// .env lives in the repo root, but pnpm starts this script inside apps/server.
const envFile = resolve(import.meta.dirname, '../../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const app = buildApp({ logger: true });

try {
  await app.listen(resolveListenOptions(process.env));
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
