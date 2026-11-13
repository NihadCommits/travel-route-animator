import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  elevationSampleCount,
  measureLine,
  TERRAIN_TILE_SIZE,
  type LngLat,
  type RouteElevation,
} from '@travel-route-animator/core';
import { encode } from 'fast-png';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app';
import { createDemTiles, ElevationUnavailableError, type DemTiles } from './demTiles';
import { createElevationSampler } from './sampler';

/** A Terrarium PNG of one height everywhere. */
function terrariumPng(height: number): Uint8Array {
  const v = height + 32768;
  const rgb = [Math.floor(v / 256), Math.floor(v % 256), 0];
  const size = TERRAIN_TILE_SIZE;
  const data = new Uint8Array(size * size * 3);
  for (let i = 0; i < size * size; i++) data.set(rgb, i * 3);
  return encode({ width: size, height: size, data, channels: 3, depth: 8 });
}

const pngResponse = (height: number) =>
  new Response(Buffer.from(terrariumPng(height)), { headers: { 'content-type': 'image/png' } });

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tra-dem-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('createDemTiles', () => {
  it('loads a tile once, keeps it on disk and decodes its heights', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(pngResponse(1234)));
    const tiles = createDemTiles({ cacheDir: dir, userAgent: 'test', fetchImpl });
    const grid = await tiles.get(12, 2177, 1435);
    expect(grid).toHaveLength(TERRAIN_TILE_SIZE * TERRAIN_TILE_SIZE);
    expect(grid[0]).toBe(1234);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/12/2177/1435.png',
      expect.objectContaining({ headers: { 'User-Agent': 'test' } }),
    );
    await tiles.get(12, 2177, 1435);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // A new server (another run) finds it on disk.
    const later = createDemTiles({ cacheDir: dir, userAgent: 'test', fetchImpl });
    expect((await later.get(12, 2177, 1435))[0]).toBe(1234);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await readdir(join(dir, '12', '2177'))).toEqual(['1435.png']);
  });

  it('takes a missing tile as sea level and says when the source is down', async () => {
    const missing = createDemTiles({
      cacheDir: dir,
      userAgent: 'test',
      fetchImpl: () => Promise.resolve(new Response('', { status: 404 })),
    });
    expect((await missing.get(3, 1, 1)).every((height) => height === 0)).toBe(true);

    const down = createDemTiles({
      cacheDir: dir,
      userAgent: 'test',
      fetchImpl: () => Promise.reject(new TypeError('fetch failed')),
    });
    await expect(down.get(3, 2, 2)).rejects.toBeInstanceOf(ElevationUnavailableError);
    const broken = createDemTiles({
      cacheDir: dir,
      userAgent: 'test',
      fetchImpl: () => Promise.resolve(new Response('', { status: 500 })),
    });
    await expect(broken.get(3, 2, 2)).rejects.toThrow(/HTTP 500/);
  });
});

/** Heights rising by one metre per pixel to the east, so every sample tells where it is. */
const slope: DemTiles = {
  get: (_z, x) =>
    Promise.resolve(
      Float32Array.from({ length: TERRAIN_TILE_SIZE ** 2 }, (_, i) => {
        return x * TERRAIN_TILE_SIZE + (i % TERRAIN_TILE_SIZE);
      }),
    ),
};

describe('createElevationSampler', () => {
  const line: LngLat[] = [
    [11.35, 47.26],
    [11.4, 47.26],
  ];

  it('samples every step along the line, both ends included', async () => {
    const elevation = await createElevationSampler(slope).sample(line, 20);
    const { lengthM } = measureLine(line);
    expect(elevation.source).toBe('dem');
    expect(elevation.stepM).toBe(20);
    expect(elevation.elevationsM).toHaveLength(elevationSampleCount(lengthM, 20));
    // Going east, the slope only climbs.
    const heights = elevation.elevationsM;
    expect(heights.every((h, i) => i === 0 || h >= heights[i - 1]!)).toBe(true);
  });

  it('never takes more samples than a route of this length gets', async () => {
    const long: LngLat[] = [
      [5, 47],
      [15, 47],
    ];
    const elevation = await createElevationSampler(slope).sample(long, 20);
    expect(elevation.elevationsM.length).toBeLessThanOrEqual(2000);
    expect(elevation.stepM).toBeGreaterThan(20);
  });
});

describe('POST /api/elevation', () => {
  const answer: RouteElevation = { source: 'dem', stepM: 20, elevationsM: [580, 600] };

  it('answers with the heights along the line', async () => {
    const sample = vi.fn(() => Promise.resolve(answer));
    const app = buildApp({ dataDir: dir, elevation: { sample } });
    const response = await app.inject({
      method: 'POST',
      url: '/api/elevation',
      payload: {
        line: [
          [11.35, 47.26],
          [11.4, 47.3],
        ],
        stepM: 20,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(answer);
    expect(sample).toHaveBeenCalledWith(
      [
        [11.35, 47.26],
        [11.4, 47.3],
      ],
      20,
      expect.any(AbortSignal),
    );
    await app.close();
  });

  it('checks the request and says when no heights can be had', async () => {
    const app = buildApp({ dataDir: dir });
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/elevation',
      payload: { line: [[11.35, 47.26]] },
    });
    expect(invalid.statusCode).toBe(400);
    const unavailable = await app.inject({
      method: 'POST',
      url: '/api/elevation',
      payload: {
        line: [
          [11.35, 47.26],
          [11.4, 47.3],
        ],
      },
    });
    expect(unavailable.statusCode).toBe(502);
    expect(unavailable.json()).toMatchObject({ error: 'unavailable' });
    await app.close();
  });
});
