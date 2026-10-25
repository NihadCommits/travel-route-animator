// `pnpm data:airports`: downloads the OurAirports list once and keeps the airports worth
// offering for flights in data/airports/airports.json (not part of the repository).
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { resolveDataDir, resolveServiceConfig } from '../config';
import { writeFileAtomic } from '../fs/writeFileAtomic';
import { airportsFromCsv, OURAIRPORTS_CSV_URL } from './airportData';
import { airportsFile } from './airportStore';

// Fewer would mean the file format changed and the filter silently dropped almost everything.
const MIN_EXPECTED = 1000;

const repoRoot = resolve(import.meta.dirname, '../../../..');
const envFile = resolve(repoRoot, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const { userAgent } = resolveServiceConfig(process.env);
console.log(`Downloading ${OURAIRPORTS_CSV_URL} …`);
const response = await fetch(OURAIRPORTS_CSV_URL, { headers: { 'User-Agent': userAgent } });
if (!response.ok) {
  console.error(`OurAirports answered ${response.status}; nothing was changed.`);
  process.exit(1);
}

const airports = airportsFromCsv(await response.text());
if (airports.length < MIN_EXPECTED) {
  console.error(`Only ${airports.length} airports found; the CSV format may have changed.`);
  process.exit(1);
}

const file = airportsFile(resolveDataDir(process.env, repoRoot));
await mkdir(dirname(file), { recursive: true });
await writeFileAtomic(file, JSON.stringify(airports));
console.log(`${airports.length} airports written to ${file}`);
