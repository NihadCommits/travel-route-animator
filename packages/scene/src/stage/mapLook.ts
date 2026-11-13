import type { Theme, ThemeExtras, Timeline } from '@travel-route-animator/core';
import {
  backgroundOf,
  buildStyle,
  MAPTILER_ATTRIBUTION,
  resolveTheme,
  skyOf,
  styleCredits,
  TERRAIN_ATTRIBUTION,
} from '@travel-route-animator/styles';
import type { SkySpecification, StyleSpecification } from 'maplibre-gl';
import { contourTilesUrl } from './contours';

/** How a stage's map looks (ADR 0010): worked out once per stage from its resolved style. */
export interface MapLook {
  style: StyleSpecification;
  sky: Pick<SkySpecification, 'sky-color' | 'horizon-color'>;
  /** Around the picture and behind the globe. */
  background: string;
  credits: string[];
  extras: ThemeExtras;
  /** The style names an own theme this render was not given; the default stands in. */
  themeMissing: boolean;
  /** No map, a transparent picture: an overlay for footage (ADR 0013). */
  transparent: boolean;
  /** Changes whenever the style does; the stage builds a new map then. */
  key: string;
}

export interface MapLookOptions {
  /** Own themes by ID; built-in ones need not be listed. */
  themes?: Readonly<Record<string, Theme>> | undefined;
  /** Our server, for satellite tiles. */
  serverUrl?: string | undefined;
}

export function mapLookOf(timeline: Timeline, { themes, serverUrl }: MapLookOptions): MapLook {
  const { mapStyle, mapOptions } = timeline;
  const { theme, missing } = resolveTheme(mapStyle.themeId, themes);
  const satelliteMix = mapOptions.satelliteMix && serverUrl !== undefined;
  const style = buildStyle(mapStyle, theme, {
    serverUrl,
    buildings3d: mapOptions.buildings3d,
    satelliteMix: mapOptions.satelliteMix,
    terrain: mapOptions.terrain,
    transparent: mapOptions.transparent,
    ...(mapStyle.base === 'terrain' &&
      !mapOptions.transparent && { contourTiles: contourTilesUrl() }),
  });
  if (mapOptions.transparent) {
    return {
      style,
      sky: { 'sky-color': 'rgba(0, 0, 0, 0)', 'horizon-color': 'rgba(0, 0, 0, 0)' },
      background: 'transparent',
      // No map is shown; the terrain still shapes the lines when it is on.
      credits: mapOptions.terrain ? [TERRAIN_ATTRIBUTION] : [],
      extras: { texture: 'none', vignette: 0 },
      themeMissing: false,
      transparent: true,
      key: JSON.stringify(style),
    };
  }
  const credits = [
    ...styleCredits(mapStyle, theme),
    // A dive-in that ends on satellite shows MapTiler's pictures too, 3D terrain the DEM.
    ...(satelliteMix ? [MAPTILER_ATTRIBUTION] : []),
    ...(mapOptions.terrain ? [TERRAIN_ATTRIBUTION] : []),
  ];
  return {
    style,
    sky: skyOf(mapStyle, theme),
    background: backgroundOf(mapStyle, theme),
    credits: [...new Set(credits)],
    // Satellite pictures need no paper grain or vignette from a vector theme.
    extras:
      mapStyle.base === 'vector' || mapStyle.base === 'terrain'
        ? theme.extras
        : { texture: 'none', vignette: 0 },
    themeMissing: missing,
    transparent: false,
    key: JSON.stringify(style),
  };
}
