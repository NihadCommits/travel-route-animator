import type { Theme, ThemeExtras, Timeline } from '@travel-route-animator/core';
import {
  backgroundOf,
  buildStyle,
  MAPTILER_ATTRIBUTION,
  resolveTheme,
  skyOf,
  styleCredits,
} from '@travel-route-animator/styles';
import type { SkySpecification, StyleSpecification } from 'maplibre-gl';

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
  const { mapStyle, view } = timeline;
  const { theme, missing } = resolveTheme(mapStyle.themeId, themes);
  const { outro } = timeline;
  const style = buildStyle(mapStyle, theme, {
    serverUrl,
    // A 3D arrival needs the buildings standing, whatever the stage's view says (M11).
    buildings3d: view.buildings3d || outro.type === 'arrival-3d',
    satelliteMix: outro.type === 'dive-in' && outro.switchToSatellite,
  });
  return {
    style,
    sky: skyOf(mapStyle, theme),
    background: backgroundOf(mapStyle, theme),
    // A dive-in that ends on satellite shows MapTiler's pictures too.
    credits:
      outro.type === 'dive-in' && outro.switchToSatellite && serverUrl
        ? [...new Set([...styleCredits(mapStyle, theme), MAPTILER_ATTRIBUTION])]
        : styleCredits(mapStyle, theme),
    // Satellite pictures need no paper grain or vignette from a vector theme.
    extras:
      mapStyle.base === 'vector' || mapStyle.base === 'terrain'
        ? theme.extras
        : { texture: 'none', vignette: 0 },
    themeMissing: missing,
    key: JSON.stringify(style),
  };
}
