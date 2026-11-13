import type { Theme, ThemeExtras, Timeline } from '@travel-route-animator/core';
import {
  backgroundOf,
  buildStyle,
  mapCreditsOf,
  resolveTheme,
  skyOf,
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
  const credits = mapCreditsOf(mapStyle, mapOptions, theme, serverUrl !== undefined);
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
      credits,
      extras: { texture: 'none', vignette: 0 },
      themeMissing: false,
      transparent: true,
      key: JSON.stringify(style),
    };
  }
  return {
    style,
    sky: skyOf(mapStyle, theme),
    background: backgroundOf(mapStyle, theme),
    credits,
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
