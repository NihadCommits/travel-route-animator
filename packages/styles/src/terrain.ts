import {
  TERRAIN_MAX_ZOOM,
  TERRAIN_TILE_SIZE,
  TERRAIN_TILES_URL,
  type ThemeTokens,
} from '@travel-route-animator/core';
import type {
  ExpressionSpecification,
  LayerSpecification,
  RasterDEMSourceSpecification,
} from 'maplibre-gl';

// The ground in the theme's colours (ADR 0012): hillshading, a colour relief by height and
// contour lines for the base "terrain", and the shading alone under 3D terrain on other maps.

/** The DEM behind 3D terrain; MapLibre wants it apart from the one hillshading reads. */
export const TERRAIN_SOURCE = 'terrain-dem';
/** The DEM behind hillshade and colour relief. */
export const RELIEF_SOURCE = 'relief-dem';
export const CONTOUR_SOURCE = 'contours';
/** The vector layer maplibre-contour puts its lines in, and the keys on each line. */
export const CONTOUR_LAYER = 'contours';
export const CONTOUR_ELEVATION_KEY = 'ele';
export const CONTOUR_LEVEL_KEY = 'level';

/**
 * Metres between contour lines per zoom, [minor, major]: wide at a valley's scale, the usual
 * 20 m of hiking maps when close. maplibre-contour reads this from its tile URL.
 */
export const CONTOUR_THRESHOLDS: Record<number, [number, number]> = {
  10: [200, 1000],
  11: [100, 500],
  12: [100, 500],
  13: [50, 250],
  14: [20, 100],
  15: [10, 50],
};

export function demSource(): RasterDEMSourceSpecification {
  return {
    type: 'raster-dem',
    tiles: [TERRAIN_TILES_URL],
    encoding: 'terrarium',
    tileSize: TERRAIN_TILE_SIZE,
    maxzoom: TERRAIN_MAX_ZOOM,
  };
}

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1, 7), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** `a` blended towards `b` by `t` (0 = a, 1 = b), as #rrggbb. */
export function mixHex(a: string, b: string, t: number): string {
  const from = channels(a);
  const to = channels(b);
  return `#${from
    .map((c, i) =>
      Math.round(c + (to[i]! - c) * t)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/**
 * Hillshading lit from the north-west, as on printed maps. Shadows lean towards the label
 * colour and highlights towards the halo, so a dark theme gets light highlights and dark
 * shadows that suit it. `strength`: subtle under 3D terrain, stronger on the terrain map.
 */
export function hillshadeLayer(t: ThemeTokens, strength: number): LayerSpecification {
  const dark = mixHex(t.land, '#000000', 0.55);
  return {
    id: 'hillshade',
    type: 'hillshade',
    source: RELIEF_SOURCE,
    paint: {
      'hillshade-method': 'igor',
      'hillshade-exaggeration': strength,
      'hillshade-shadow-color': mixHex(dark, t.labelText, 0.25),
      'hillshade-highlight-color': mixHex(t.land, t.labelHalo, 0.6),
      'hillshade-accent-color': dark,
      'hillshade-illumination-anchor': 'map',
    },
  };
}

/**
 * Colour by height: the green of the landcover in the valleys, the land colour on the slopes,
 * a little of the label colour on the high ground and ice on the peaks. Derived from the theme,
 * so a night map gets a night relief.
 */
export function colorReliefLayer(t: ThemeTokens): LayerSpecification {
  const color: ExpressionSpecification = [
    'interpolate',
    ['linear'],
    ['elevation'],
    0,
    mixHex(t.landcover, t.land, 0.2),
    700,
    mixHex(t.landcover, t.land, 0.65),
    1500,
    t.land,
    2400,
    mixHex(t.land, t.labelText, 0.18),
    3200,
    mixHex(t.land, t.ice, 0.75),
  ];
  return {
    id: 'color-relief',
    type: 'color-relief',
    source: RELIEF_SOURCE,
    paint: { 'color-relief-color': color, 'color-relief-opacity': 0.9 },
  };
}

/** Thin contour lines, stronger every few, with heights on the strong ones. */
export function contourLayers(t: ThemeTokens, font: string[]): LayerSpecification[] {
  const major: ExpressionSpecification = ['>', ['get', CONTOUR_LEVEL_KEY], 0];
  const line = mixHex(t.land, t.labelText, 0.55);
  return [
    {
      id: 'contour',
      type: 'line',
      source: CONTOUR_SOURCE,
      'source-layer': CONTOUR_LAYER,
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': line,
        'line-opacity': ['case', major, 0.7, 0.45],
        'line-width': ['case', major, 1.6, 0.9],
      },
    },
    {
      id: 'contour-label',
      type: 'symbol',
      source: CONTOUR_SOURCE,
      'source-layer': CONTOUR_LAYER,
      filter: major,
      layout: {
        'symbol-placement': 'line',
        'text-field': ['concat', ['number-format', ['get', CONTOUR_ELEVATION_KEY], {}], ' m'],
        'text-font': font,
        'text-size': 15,
        'text-padding': 30,
      },
      paint: {
        'text-color': line,
        'text-halo-color': t.land,
        'text-halo-width': 2,
      },
    },
  ];
}
