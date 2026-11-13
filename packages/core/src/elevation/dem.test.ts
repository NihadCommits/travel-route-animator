import { describe, expect, it } from 'vitest';
import {
  decodeTerrarium,
  decodeTerrariumTile,
  demPixelM,
  demZoomFor,
  sampleHeight,
  tileKey,
  tilesFor,
  worldPixelOf,
  type HeightGrid,
} from './dem';

/** The RGB a Terrarium tile stores for a height. */
function encode(height: number): [number, number, number] {
  const v = height + 32768;
  return [Math.floor(v / 256), Math.floor(v % 256), Math.round((v - Math.floor(v)) * 256)];
}

describe('Terrarium', () => {
  it('decodes sea level, mountains, sub-metre steps and the deep sea', () => {
    expect(decodeTerrarium(128, 0, 0)).toBe(0);
    expect(decodeTerrarium(...encode(3798))).toBe(3798);
    expect(decodeTerrarium(...encode(412.5))).toBe(412.5);
    expect(decodeTerrarium(...encode(-10_994))).toBe(-10_994);
  });

  it('turns RGBA and RGB pixels into a grid of heights', () => {
    const heights = [0, 100, 200.25, -5];
    const rgba = heights.flatMap((h) => [...encode(h), 255]);
    const rgb = heights.flatMap((h) => encode(h));
    expect([...decodeTerrariumTile(rgba, 2, 4)]).toEqual(heights);
    expect([...decodeTerrariumTile(rgb, 2, 3)]).toEqual(heights);
  });
});

describe('tile maths', () => {
  it('finds the pixel of a point in the world grid', () => {
    expect(worldPixelOf([0, 0], 0, 256)).toEqual([128, 128]);
    expect(worldPixelOf([-180, 0], 1, 256)).toEqual([0, 256]);
    // The date line wraps around instead of leaving the grid.
    expect(worldPixelOf([180, 0], 0, 256)[0]).toBe(0);
    // Salzburg lies in tile 8/137/89 of the usual slippy map grid.
    const [x, y] = worldPixelOf([13.04, 47.81], 8, 256);
    expect([Math.floor(x / 256), Math.floor(y / 256)]).toEqual([137, 89]);
  });

  it('picks the coarsest zoom whose pixels are no larger than the step', () => {
    expect(demPixelM(0, 0)).toBeCloseTo(156_543, 0);
    // At 47° north a 20 m step needs zoom 13 (13 m pixels), zoom 12 has 26 m; 250 m gets zoom 9.
    expect(demZoomFor(20, 47)).toBe(13);
    expect(demPixelM(12, 47)).toBeGreaterThan(20);
    expect(demZoomFor(250, 47)).toBe(9);
    expect(demZoomFor(5, 47)).toBe(13);
  });

  it('names every tile the four neighbouring pixels come from', () => {
    // Right at a tile corner, the neighbours sit in four tiles.
    const corner = (x: number, y: number) => {
      const lng = (x / 4) * 360 - 180;
      const n = Math.PI - (2 * Math.PI * y) / 4;
      return [lng, (180 / Math.PI) * Math.atan(Math.sinh(n))] as [number, number];
    };
    expect(tilesFor([corner(1, 1)], 2, 256).sort()).toEqual(
      [tileKey(2, 0, 0), tileKey(2, 0, 1), tileKey(2, 1, 0), tileKey(2, 1, 1)].sort(),
    );
    expect(
      tilesFor(
        [
          [10, 10],
          [10, 10],
        ],
        3,
        256,
      ),
    ).toHaveLength(1);
  });
});

describe('sampleHeight', () => {
  // Zoom 1 with 2-pixel tiles: the world is 4 × 4 pixels in four tiles.
  const grid = (values: number[]): HeightGrid => Float32Array.from(values);
  const tiles = new Map<string, HeightGrid>([
    [tileKey(1, 0, 0), grid([0, 100, 0, 100])],
    [tileKey(1, 1, 0), grid([200, 300, 200, 300])],
    [tileKey(1, 0, 1), grid([0, 100, 0, 100])],
    [tileKey(1, 1, 1), grid([200, 300, 200, 300])],
  ]);
  /** The point at world pixel (x, y). */
  const at = (x: number, y: number): [number, number] => {
    const lng = (x / 4) * 360 - 180;
    const n = Math.PI - (2 * Math.PI * y) / 4;
    return [lng, (180 / Math.PI) * Math.atan(Math.sinh(n))];
  };

  it('gives a pixel its own height at its centre', () => {
    expect(sampleHeight(at(1.5, 0.5), 1, 2, tiles)).toBeCloseTo(100, 6);
    expect(sampleHeight(at(2.5, 1.5), 1, 2, tiles)).toBeCloseTo(200, 6);
  });

  it('blends between pixel centres, also across a tile edge', () => {
    expect(sampleHeight(at(1, 0.5), 1, 2, tiles)).toBeCloseTo(50, 6);
    expect(sampleHeight(at(2, 0.5), 1, 2, tiles)).toBeCloseTo(150, 6);
  });

  it('counts a missing tile as sea level', () => {
    expect(sampleHeight(at(1.5, 0.5), 1, 2, new Map())).toBe(0);
  });
});
