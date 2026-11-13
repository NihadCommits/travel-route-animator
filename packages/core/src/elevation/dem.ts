import type { LngLat } from '../geo/lngLat';

// Heights from terrain tiles (ADR 0012). A DEM tile ("digital elevation model") is a picture
// whose pixels are heights instead of colours. Terrarium packs a height into the red, green and
// blue byte of a pixel; the tiles follow the usual web map grid (z/x/y in Web Mercator), so the
// same maths finds the pixel under a point as for any map tile.

/** AWS Terrain Tiles (Mapzen/Tilezen): Terrarium PNGs, 256 pixels, zoom 0 to 15, no key. */
export const TERRAIN_TILES_URL =
  'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const TERRAIN_TILE_SIZE = 256;
export const TERRAIN_MAX_ZOOM = 15;

/**
 * Terrarium: height = R · 256 + G + B / 256 − 32768 metres. Red and green give whole metres
 * from −32768 to +32767, blue adds 1/256 m steps.
 */
export function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

/** Ground metres per pixel at the equator on zoom 0 for 256-pixel tiles. */
const EQUATOR_M_PER_PX_Z0 = (2 * Math.PI * 6_378_137) / 256;

/** How many ground metres one DEM pixel covers at this zoom and latitude. */
export function demPixelM(zoom: number, latDeg: number): number {
  return (EQUATOR_M_PER_PX_Z0 * Math.cos((latDeg * Math.PI) / 180)) / 2 ** zoom;
}

/**
 * The DEM zoom for samples `stepM` apart: the lowest one whose pixels are no larger than the
 * step. Finer pixels would not add anything between two samples, only more tiles to load. At
 * most 13: pixels of 10 to 20 m in Europe, about as fine as the data (EU-DEM has 30 m, Austria
 * 10 m).
 */
export function demZoomFor(stepM: number, latDeg: number, maxZoom = 13): number {
  for (let zoom = 0; zoom < maxZoom; zoom++) {
    if (demPixelM(zoom, latDeg) <= stepM) return zoom;
  }
  return maxZoom;
}

/**
 * The point in the pixel grid of the whole world at this zoom: x to the east, y to the south,
 * pixel i covering [i, i + 1). Tiles are cut from this grid, tileSize pixels each.
 */
export function worldPixelOf([lng, lat]: LngLat, zoom: number, tileSize: number): [number, number] {
  const size = tileSize * 2 ** zoom;
  const clamped = Math.max(-85.051129, Math.min(85.051129, lat));
  const sin = Math.sin((clamped * Math.PI) / 180);
  const x = ((((lng + 180) / 360) % 1) + 1) % 1;
  const y = 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
  return [x * size, y * size];
}

/** "z/x/y" of a tile. */
export type TileKey = string;

export function tileKey(zoom: number, x: number, y: number): TileKey {
  return `${zoom}/${x}/${y}`;
}

/**
 * The four pixels around a point, with their weights. A pixel's height belongs to its centre
 * (i + 0.5), so between centres the height is blended in both directions (bilinear): the
 * result is smooth instead of jumping from pixel to pixel.
 */
function neighbours(gx: number, gy: number, worldSize: number) {
  const fx = gx - 0.5;
  const fy = Math.max(0, Math.min(worldSize - 1, gy - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  // Around the date line the grid wraps; at the poles it stops.
  const wrap = (x: number) => ((x % worldSize) + worldSize) % worldSize;
  const y1 = Math.min(worldSize - 1, y0 + 1);
  return [
    { x: wrap(x0), y: y0, w: (1 - tx) * (1 - ty) },
    { x: wrap(x0 + 1), y: y0, w: tx * (1 - ty) },
    { x: wrap(x0), y: y1, w: (1 - tx) * ty },
    { x: wrap(x0 + 1), y: y1, w: tx * ty },
  ];
}

/** Every tile the bilinear samples of these points read from. */
export function tilesFor(points: readonly LngLat[], zoom: number, tileSize: number): TileKey[] {
  const worldSize = tileSize * 2 ** zoom;
  const keys = new Set<TileKey>();
  for (const point of points) {
    const [gx, gy] = worldPixelOf(point, zoom, tileSize);
    for (const { x, y } of neighbours(gx, gy, worldSize)) {
      keys.add(tileKey(zoom, Math.floor(x / tileSize), Math.floor(y / tileSize)));
    }
  }
  return [...keys];
}

/** A decoded tile: tileSize × tileSize heights in metres, row by row from the north-west. */
export type HeightGrid = Float32Array;

/**
 * The height at a point, blended from the four pixels around it. `tiles` must hold every tile
 * `tilesFor` named for the point; a missing one counts as sea level.
 */
export function sampleHeight(
  point: LngLat,
  zoom: number,
  tileSize: number,
  tiles: ReadonlyMap<TileKey, HeightGrid>,
): number {
  const worldSize = tileSize * 2 ** zoom;
  const [gx, gy] = worldPixelOf(point, zoom, tileSize);
  let height = 0;
  for (const { x, y, w } of neighbours(gx, gy, worldSize)) {
    if (w === 0) continue;
    const tx = Math.floor(x / tileSize);
    const ty = Math.floor(y / tileSize);
    const grid = tiles.get(tileKey(zoom, tx, ty));
    const value = grid?.[(y - ty * tileSize) * tileSize + (x - tx * tileSize)] ?? 0;
    height += w * value;
  }
  return height;
}

/** Turns the RGBA (or RGB) pixels of a Terrarium tile into heights. */
export function decodeTerrariumTile(
  pixels: ArrayLike<number>,
  tileSize: number,
  channels: number,
): HeightGrid {
  const grid = new Float32Array(tileSize * tileSize);
  for (let i = 0; i < grid.length; i++) {
    const at = i * channels;
    grid[i] = decodeTerrarium(pixels[at]!, pixels[at + 1]!, pixels[at + 2]!);
  }
  return grid;
}
