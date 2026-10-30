import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** Where the server looks for the airport list (see airportStore.ts in apps/server). */
export const airportsFileIn = (dataDir: string) => join(dataDir, 'airports', 'airports.json');

/**
 * Puts the airport list shipped with the app into the data folder, where the server reads
 * it: on the first start, and again when an update brought a different one. In the web
 * version `pnpm data:airports` does this. Compares contents, not dates: a copy gets a new
 * date, and an installer may or may not keep the original ones. Returns whether it copied.
 */
export async function ensureAirports(shipped: string, dataDir: string): Promise<boolean> {
  const source = await readFile(shipped).catch(() => undefined);
  if (!source) return false;
  const target = airportsFileIn(dataDir);
  const current = await readFile(target).catch(() => undefined);
  if (current?.equals(source)) return false;
  await mkdir(dirname(target), { recursive: true });
  await copyFile(shipped, target);
  return true;
}
