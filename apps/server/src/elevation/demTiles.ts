import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  decodeTerrariumTile,
  TERRAIN_TILE_SIZE,
  TERRAIN_TILES_URL,
  type HeightGrid,
} from '@travel-route-animator/core';
import { decode } from 'fast-png';
import { writeFileAtomic } from '../fs/writeFileAtomic';

// Terrain tiles for the height profiles (ADR 0012). Heights do not change, so a tile is
// fetched once and kept on disk for good; the last few decoded ones also stay in memory,
// because neighbouring samples read from the same tiles.

export class ElevationUnavailableError extends Error {
  override name = 'ElevationUnavailableError';
}

export interface DemTiles {
  /** The heights of tile z/x/y. */
  get(z: number, x: number, y: number, signal?: AbortSignal): Promise<HeightGrid>;
}

export interface DemTileOptions {
  cacheDir: string;
  userAgent: string;
  fetchImpl?: typeof fetch;
  /** Tile URL with {z}, {x}, {y}; AWS Terrain Tiles by default. */
  url?: string;
  /** Decoded tiles kept in memory (256 KB each). */
  memoryTiles?: number;
  /** Requests running at the same time; the bucket is a CDN, but it is not ours. */
  concurrency?: number;
}

/** Runs at most `limit` tasks at once, the rest wait in order. */
function createLimiter(limit: number) {
  let running = 0;
  const waiting: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (running >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    running++;
    try {
      return await task();
    } finally {
      running--;
      waiting.shift()?.();
    }
  };
}

export function createDemTiles({
  cacheDir,
  userAgent,
  fetchImpl = fetch,
  url = TERRAIN_TILES_URL,
  memoryTiles = 64,
  concurrency = 4,
}: DemTileOptions): DemTiles {
  const memory = new Map<string, Promise<HeightGrid>>();
  const limit = createLimiter(concurrency);

  async function bytesOf(z: number, x: number, y: number, signal?: AbortSignal) {
    const file = join(cacheDir, String(z), String(x), `${y}.png`);
    try {
      return await readFile(file);
    } catch {
      // Not cached yet.
    }
    const tileUrl = url
      .replace('{z}', String(z))
      .replace('{x}', String(x))
      .replace('{y}', String(y));
    let response: Response;
    try {
      response = await limit(() =>
        fetchImpl(tileUrl, { headers: { 'User-Agent': userAgent }, ...(signal && { signal }) }),
      );
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ElevationUnavailableError(`Terrain tile ${z}/${x}/${y} could not be loaded`);
    }
    // The open sea has no tiles in some sets; it is at sea level.
    if (response.status === 404) return undefined;
    if (!response.ok) {
      throw new ElevationUnavailableError(`Terrain tile ${z}/${x}/${y}: HTTP ${response.status}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    await mkdir(dirname(file), { recursive: true });
    await writeFileAtomic(file, bytes);
    return bytes;
  }

  async function load(z: number, x: number, y: number, signal?: AbortSignal) {
    const bytes = await bytesOf(z, x, y, signal);
    if (!bytes) return new Float32Array(TERRAIN_TILE_SIZE * TERRAIN_TILE_SIZE);
    const image = decode(bytes);
    if (image.width !== TERRAIN_TILE_SIZE || image.depth !== 8 || image.channels < 3) {
      throw new ElevationUnavailableError(`Terrain tile ${z}/${x}/${y} is not a Terrarium tile`);
    }
    return decodeTerrariumTile(image.data, TERRAIN_TILE_SIZE, image.channels);
  }

  return {
    get(z, x, y, signal) {
      const key = `${z}/${x}/${y}`;
      const known = memory.get(key);
      if (known) {
        // Most recently used goes to the end; the oldest is dropped first.
        memory.delete(key);
        memory.set(key, known);
        return known;
      }
      const loading = load(z, x, y, signal);
      memory.set(key, loading);
      // A failed load is not kept, so the next request tries again.
      loading.catch(() => memory.delete(key));
      while (memory.size > memoryTiles) memory.delete(memory.keys().next().value!);
      return loading;
    },
  };
}
