import type { MapStyleRef, Theme } from '@travel-route-animator/core';

/** Credits OpenFreeMap asks for wherever its tiles are shown, including rendered videos. */
export const OPENFREEMAP_ATTRIBUTION = 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap';
/** The shaded relief some themes show at low zoom (public domain; credited out of courtesy). */
export const NATURAL_EARTH_ATTRIBUTION = 'Natural Earth';
/** MapTiler's satellite imagery; its terms ask for this text wherever the tiles are shown. */
export const MAPTILER_ATTRIBUTION = '© MapTiler © OpenStreetMap contributors';
/**
 * AWS Terrain Tiles (ADR 0012), short enough for the corner of a video. The full list of
 * sources is in tilezen/joerd's docs/attribution.md; the main ones for Europe are named.
 */
export const TERRAIN_ATTRIBUTION =
  'Terrain: Mapzen, USGS SRTM/GMTED, EU-DEM © Copernicus, DGM Österreich and others';

/** The credits for the sources a style draws from, each once, in a stable order. */
export function styleCredits(style: MapStyleRef, theme: Theme): string[] {
  if (style.base === 'satellite') return [MAPTILER_ATTRIBUTION];
  if (style.base === 'satellite-hybrid') return [MAPTILER_ATTRIBUTION, OPENFREEMAP_ATTRIBUTION];
  const credits = theme.layers.relief
    ? [OPENFREEMAP_ATTRIBUTION, NATURAL_EARTH_ATTRIBUTION]
    : [OPENFREEMAP_ATTRIBUTION];
  return style.base === 'terrain' ? [...credits, TERRAIN_ATTRIBUTION] : credits;
}
