import type { MapStyleRef, Theme } from '@travel-route-animator/core';

/** Credits OpenFreeMap asks for wherever its tiles are shown, including rendered videos. */
export const OPENFREEMAP_ATTRIBUTION = 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap';
/** The shaded relief some themes show at low zoom (public domain; credited out of courtesy). */
export const NATURAL_EARTH_ATTRIBUTION = 'Natural Earth';
/** MapTiler's satellite imagery; its terms ask for this text wherever the tiles are shown. */
export const MAPTILER_ATTRIBUTION = '© MapTiler © OpenStreetMap contributors';

/** The credits for the sources a style draws from, each once, in a stable order. */
export function styleCredits(style: MapStyleRef, theme: Theme): string[] {
  if (style.base === 'satellite') return [MAPTILER_ATTRIBUTION];
  if (style.base === 'satellite-hybrid') return [MAPTILER_ATTRIBUTION, OPENFREEMAP_ATTRIBUTION];
  return theme.layers.relief
    ? [OPENFREEMAP_ATTRIBUTION, NATURAL_EARTH_ATTRIBUTION]
    : [OPENFREEMAP_ATTRIBUTION];
}
