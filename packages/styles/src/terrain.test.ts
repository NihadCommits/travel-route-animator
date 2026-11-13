import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { TERRAIN_TILES_URL } from '@travel-route-animator/core';
import { describe, expect, it } from 'vitest';
import { buildStyle } from './buildStyle';
import { OPENFREEMAP_ATTRIBUTION, styleCredits, TERRAIN_ATTRIBUTION } from './credits';
import { mixHex, RELIEF_SOURCE, TERRAIN_SOURCE } from './terrain';
import { BUILT_IN_THEMES, resolveTheme } from './themes';

const clean = resolveTheme('clean-light').theme;
const contourTiles = 'dem-contour://{z}/{x}/{y}?thresholds=10*200*1000';
const ids = (style: ReturnType<typeof buildStyle>) => style.layers.map((layer) => layer.id);

describe('the terrain base', () => {
  it('gives valid styles in every built-in theme', () => {
    for (const theme of BUILT_IN_THEMES) {
      const style = buildStyle({ base: 'terrain' }, theme, {
        contourTiles,
        terrain: { exaggeration: 1.5 },
      });
      expect(validateStyleMin(style), theme.id).toEqual([]);
    }
  });

  it('puts relief under the landcover, shading under the water, contours above it', () => {
    const order = ids(buildStyle({ base: 'terrain' }, clean, { contourTiles }));
    const at = (id: string) => order.indexOf(id);
    expect(at('background')).toBe(0);
    expect(at('color-relief')).toBe(1);
    expect(at('hillshade')).toBeLessThan(at('water'));
    expect(at('contour')).toBeGreaterThan(at('water'));
    expect(at('contour-label')).toBeLessThan(at('waterway'));
  });

  it('reads heights from the terrain tiles and contours from the given tiles', () => {
    const style = buildStyle({ base: 'terrain' }, clean, { contourTiles });
    expect(style.sources[RELIEF_SOURCE]).toMatchObject({
      type: 'raster-dem',
      tiles: [TERRAIN_TILES_URL],
      encoding: 'terrarium',
    });
    expect(style.sources.contours).toMatchObject({ type: 'vector', tiles: [contourTiles] });
    // Without contour tiles there are no contour lines, the rest stays.
    const plain = ids(buildStyle({ base: 'terrain' }, clean));
    expect(plain).not.toContain('contour');
    expect(plain).toContain('hillshade');
  });

  it('is credited with the terrain data', () => {
    expect(styleCredits({ base: 'terrain' }, clean)).toEqual([
      OPENFREEMAP_ATTRIBUTION,
      TERRAIN_ATTRIBUTION,
    ]);
  });
});

describe('3D terrain', () => {
  it('stands the ground up from its own source, with a subtle shading on vector maps', () => {
    const style = buildStyle({ base: 'vector' }, clean, { terrain: { exaggeration: 2 } });
    expect(style.terrain).toEqual({ source: TERRAIN_SOURCE, exaggeration: 2 });
    expect(style.sources[TERRAIN_SOURCE]).toMatchObject({ type: 'raster-dem' });
    // MapLibre wants the terrain's DEM apart from the one the shading reads.
    expect(style.sources[RELIEF_SOURCE]).toBeDefined();
    expect(ids(style)).toContain('hillshade');
    expect(validateStyleMin(style)).toEqual([]);
  });

  it('needs no shading on satellite pictures and nothing at all without terrain', () => {
    const satellite = buildStyle({ base: 'satellite' }, clean, {
      terrain: { exaggeration: 1 },
      serverUrl: 'http://127.0.0.1:5174',
    });
    expect(satellite.terrain).toBeDefined();
    expect(ids(satellite)).not.toContain('hillshade');
    const flat = buildStyle({ base: 'vector' }, clean);
    expect(flat.terrain).toBeUndefined();
    expect(Object.keys(flat.sources)).toEqual(['openmaptiles']);
  });
});

describe('mixHex', () => {
  it('blends two colours', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mixHex('#000000', '#ff8000', 0.5)).toBe('#804000');
  });
});

describe('the transparent overlay', () => {
  it('has no map at all, only the glyphs for the stop names', () => {
    const style = buildStyle({ base: 'vector' }, clean, { transparent: true, buildings3d: true });
    expect(style.layers).toEqual([]);
    expect(style.sources).toEqual({});
    expect(style.glyphs).toContain('/fonts/{fontstack}/{range}.pbf');
    expect(validateStyleMin(style)).toEqual([]);
  });

  it('keeps 3D terrain under the lines, but shows none of it', () => {
    const style = buildStyle({ base: 'terrain' }, clean, {
      transparent: true,
      terrain: { exaggeration: 1.5 },
      contourTiles,
    });
    expect(style.layers).toEqual([]);
    expect(Object.keys(style.sources)).toEqual([TERRAIN_SOURCE]);
    expect(style.terrain).toEqual({ source: TERRAIN_SOURCE, exaggeration: 1.5 });
  });
});
