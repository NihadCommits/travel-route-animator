import { TERRAIN_TILES_URL, TERRAIN_MAX_ZOOM } from '@travel-route-animator/core';
import {
  CONTOUR_ELEVATION_KEY,
  CONTOUR_LAYER,
  CONTOUR_LEVEL_KEY,
  CONTOUR_THRESHOLDS,
} from '@travel-route-animator/styles';
import { addProtocol } from 'maplibre-gl';
import mlcontour from 'maplibre-contour';

// Contour lines for the terrain base (ADR 0012). maplibre-contour turns the DEM tiles into
// vector tiles of contour lines in the browser, behind a protocol it registers with MapLibre.
// The lines are a pure function of the tiles, and a render waits for them like for any tile.

let url: string | undefined;

/** The tile URL of the contour lines; registers the protocol on first use. */
export function contourTilesUrl(): string {
  if (url) return url;
  const source = new mlcontour.DemSource({
    url: TERRAIN_TILES_URL,
    encoding: 'terrarium',
    // Lines from finer tiles would only follow the noise; the DEM is 10 to 30 m in Europe.
    maxzoom: Math.min(13, TERRAIN_MAX_ZOOM),
    // Off the main thread, so the preview keeps playing while lines are traced.
    worker: true,
  });
  source.setupMaplibre({ addProtocol });
  url = source.contourProtocolUrl({
    thresholds: CONTOUR_THRESHOLDS,
    elevationKey: CONTOUR_ELEVATION_KEY,
    levelKey: CONTOUR_LEVEL_KEY,
    contourLayer: CONTOUR_LAYER,
    // One zoom up from coarser DEM tiles: fewer requests, the same lines.
    overzoom: 1,
  });
  return url;
}
