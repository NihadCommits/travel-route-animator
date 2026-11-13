import {
  demZoomFor,
  elevationSamplePoints,
  elevationStepFor,
  measureLine,
  sampleHeight,
  TERRAIN_TILE_SIZE,
  tilesFor,
  type HeightGrid,
  type LngLat,
  type RouteElevation,
  type TileKey,
} from '@travel-route-animator/core';
import type { DemTiles } from './demTiles';

/** A route never needs more tiles than this; a longer one is sampled on a coarser zoom. */
const MAX_TILES = 160;

export interface ElevationSampler {
  /** Heights along `line`, `stepM` apart (at least as wide as the route's length allows). */
  sample(line: readonly LngLat[], stepM?: number, signal?: AbortSignal): Promise<RouteElevation>;
}

export function createElevationSampler(tiles: DemTiles): ElevationSampler {
  return {
    async sample(line, requestedStepM, signal) {
      const measured = measureLine(line);
      // Never more samples than a route of this length gets (MAX_ELEVATION_SAMPLES).
      const stepM = Math.max(requestedStepM ?? 0, elevationStepFor(measured.lengthM));
      const points = elevationSamplePoints(measured, stepM);
      const meanLat = points.reduce((sum, [, lat]) => sum + lat, 0) / points.length;

      let zoom = demZoomFor(stepM, meanLat);
      let keys = tilesFor(points, zoom, TERRAIN_TILE_SIZE);
      while (keys.length > MAX_TILES && zoom > 0) {
        zoom--;
        keys = tilesFor(points, zoom, TERRAIN_TILE_SIZE);
      }

      const grids = new Map<TileKey, HeightGrid>();
      await Promise.all(
        keys.map(async (key) => {
          const [z, x, y] = key.split('/').map(Number) as [number, number, number];
          grids.set(key, await tiles.get(z, x, y, signal));
        }),
      );
      return {
        source: 'dem',
        stepM,
        // Decimetres are plenty: the data itself is good to a few metres.
        elevationsM: points.map(
          (point) => Math.round(sampleHeight(point, zoom, TERRAIN_TILE_SIZE, grids) * 10) / 10,
        ),
      };
    },
  };
}
