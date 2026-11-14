import type {
  LabelLanguage,
  LabelSettings,
  MapStyleRef,
  Theme,
  ThemeTokens,
} from '@travel-route-animator/core';
import type {
  ExpressionSpecification,
  LayerSpecification,
  SkySpecification,
  SourceSpecification,
  StyleSpecification,
} from 'maplibre-gl';
import {
  colorReliefLayer,
  CONTOUR_SOURCE,
  contourLayers,
  demSource,
  hillshadeLayer,
  RELIEF_SOURCE,
  TERRAIN_SOURCE,
} from './terrain';

// Our own MapLibre style from a theme (ADR 0010), on OpenFreeMap's vector tiles in the
// OpenMapTiles schema. Few layers, no sprite: a video map should be calm, so that the route
// and the vehicles stand out. Layers are listed bottom to top.

const OPENFREEMAP = 'https://tiles.openfreemap.org';
const SOURCE = 'openmaptiles';
const FONT = {
  regular: ['Noto Sans Regular'],
  bold: ['Noto Sans Bold'],
  italic: ['Noto Sans Italic'],
};

export interface BuildStyleOptions {
  /**
   * Our own server, which hands out satellite tiles with the key it keeps (ADR 0010). Without
   * it a satellite map is only its background.
   */
  serverUrl?: string | undefined;
  /** Buildings as blocks with their height, for tilted views (the stage's buildings3d). */
  buildings3d?: boolean | undefined;
  /**
   * A satellite picture over the whole map, invisible until the frame fades it in
   * (`SATELLITE_MIX_LAYER`): the end of a dive-in (M11). Needs `serverUrl`.
   */
  satelliteMix?: boolean | undefined;
  /** 3D terrain (ADR 0012): the ground stands up, `exaggeration` times as high. */
  terrain?: { exaggeration: number } | undefined;
  /**
   * Vector tiles of contour lines (maplibre-contour's protocol URL), which the terrain base
   * draws; without them it shows hillshade and relief only.
   */
  contourTiles?: string | undefined;
  /**
   * No map at all (ADR 0013): no background, no layers, only what the scene adds on top, over
   * a transparent picture. For overlays laid over footage.
   */
  transparent?: boolean | undefined;
}

/** The layer a dive-in fades the satellite picture in with (raster-opacity per frame). */
export const SATELLITE_MIX_LAYER = 'satellite-mix';

/** The theme's labels with the style's own choices on top; all false is "Saubere Karte". */
export function effectiveLabels(theme: Theme, style: MapStyleRef): LabelSettings {
  return { ...theme.labels, ...style.labels };
}

/** The theme's colours with the style's overrides on top. */
export function effectiveTokens(theme: Theme, style: MapStyleRef): ThemeTokens {
  return { ...theme.tokens, ...style.overrides };
}

/**
 * The name in the chosen language where the tiles have it, else the Latin spelling, else the
 * country's own. "local" is the name as written in the country (Lisboa, not Lissabon).
 */
export function nameIn(language: LabelLanguage = 'local'): ExpressionSpecification {
  return language === 'local'
    ? ['coalesce', ['get', 'name'], ['get', 'name:latin']]
    : ['coalesce', ['get', `name:${language}`], ['get', 'name:latin'], ['get', 'name']];
}

const classIn = (...classes: string[]): ExpressionSpecification => [
  'match',
  ['get', 'class'],
  classes,
  true,
  false,
];

/** A width that grows with the zoom, per road class; `table` maps classes to widths at 5, 10, 14, 18. */
function roadWidth(
  table: Record<string, [number, number, number, number]>,
): ExpressionSpecification {
  const at = (i: number): ExpressionSpecification =>
    [
      'match',
      ['get', 'class'],
      ...Object.entries(table).flatMap(([cls, widths]) => [cls, widths[i]!]),
      0,
    ] as unknown as ExpressionSpecification;
  return ['interpolate', ['exponential', 1.5], ['zoom'], 5, at(0), 10, at(1), 14, at(2), 18, at(3)];
}

const ROAD_WIDTHS: Record<string, [number, number, number, number]> = {
  motorway: [0.9, 2.4, 6, 22],
  trunk: [0.6, 1.8, 5, 18],
  primary: [0.5, 1.6, 5, 18],
  secondary: [0, 1, 3.6, 14],
  tertiary: [0, 0.8, 3.2, 12],
  minor: [0, 0, 2.2, 10],
  service: [0, 0, 1.2, 6],
  track: [0, 0, 0.8, 2.5],
  path: [0, 0, 0.6, 2],
};

const MINOR_CLASSES = ['minor', 'service', 'track', 'path'];

function roadsLayers(t: ThemeTokens, minorRoads: boolean): LayerSpecification[] {
  const classes = Object.keys(ROAD_WIDTHS).filter((c) => minorRoads || !MINOR_CLASSES.includes(c));
  const filter: ExpressionSpecification = [
    'all',
    classIn(...classes),
    ['!=', ['get', 'brunnel'], 'tunnel'],
  ];
  const casing = Object.fromEntries(
    classes.map((c) => {
      const [a, b, d, e] = ROAD_WIDTHS[c]!;
      // A casing only where the road itself is wide enough to have an edge.
      return [c, [a > 0 ? a + 0.6 : 0, b > 0 ? b + 1 : 0, d + 1.5, e + 3]] as const;
    }),
  ) as Record<string, [number, number, number, number]>;
  // Motorways on top of the rest where they cross.
  const sortKey: ExpressionSpecification = [
    'match',
    ['get', 'class'],
    'motorway',
    4,
    ['trunk', 'primary'],
    3,
    ['secondary', 'tertiary'],
    2,
    1,
  ];
  const layout = {
    'line-cap': 'round',
    'line-join': 'round',
    'line-sort-key': sortKey,
  } as const;
  return [
    {
      id: 'road-casing',
      type: 'line',
      source: SOURCE,
      'source-layer': 'transportation',
      minzoom: 9,
      filter,
      layout,
      paint: { 'line-color': t.roadCasing, 'line-width': roadWidth(casing) },
    },
    {
      id: 'road',
      type: 'line',
      source: SOURCE,
      'source-layer': 'transportation',
      filter,
      layout,
      paint: {
        'line-color': [
          'match',
          ['get', 'class'],
          'motorway',
          t.roadMotorway,
          ['trunk', 'primary', 'secondary', 'tertiary'],
          t.roadMajor,
          t.roadMinor,
        ],
        'line-width': roadWidth(ROAD_WIDTHS),
      },
    },
    {
      id: 'rail',
      type: 'line',
      source: SOURCE,
      'source-layer': 'transportation',
      minzoom: 8,
      filter: ['all', classIn('rail', 'transit'), ['!=', ['get', 'brunnel'], 'tunnel']],
      paint: {
        'line-color': t.rail,
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 14, 1.4, 18, 3],
        'line-dasharray': [3, 2],
      },
    },
  ];
}

function labelPaint(t: ThemeTokens, opacity = 1) {
  return {
    'text-color': t.labelText,
    'text-halo-color': t.labelHalo,
    'text-halo-width': 1.6,
    'text-halo-blur': 0.4,
    'text-opacity': opacity,
  };
}

function placeLabel(
  t: ThemeTokens,
  name: ExpressionSpecification,
  id: string,
  classes: string[],
  options: {
    minzoom: number;
    maxzoom?: number;
    size: ExpressionSpecification;
    font?: string[];
    upper?: boolean;
    opacity?: number;
  },
): LayerSpecification {
  return {
    id,
    type: 'symbol',
    source: SOURCE,
    'source-layer': 'place',
    minzoom: options.minzoom,
    ...(options.maxzoom !== undefined && { maxzoom: options.maxzoom }),
    filter: classIn(...classes),
    layout: {
      'text-field': name,
      'text-font': options.font ?? FONT.regular,
      'text-size': options.size,
      'text-max-width': 8,
      ...(options.upper && { 'text-transform': 'uppercase', 'text-letter-spacing': 0.12 }),
      // Bigger places first, when labels compete for room.
      'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
    },
    paint: labelPaint(t, options.opacity),
  };
}

function labelLayers(
  t: ThemeTokens,
  labels: LabelSettings,
  name: ExpressionSpecification,
): LayerSpecification[] {
  const layers: LayerSpecification[] = [];
  if (labels.roads) {
    layers.push({
      id: 'label-road',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'transportation_name',
      minzoom: 12,
      layout: {
        'symbol-placement': 'line',
        'text-field': name,
        'text-font': FONT.regular,
        'text-size': ['interpolate', ['linear'], ['zoom'], 12, 10, 16, 13],
      },
      paint: labelPaint(t, 0.85),
    });
  }
  if (labels.water) {
    layers.push(
      {
        id: 'label-water',
        type: 'symbol',
        source: SOURCE,
        'source-layer': 'water_name',
        filter: ['==', ['geometry-type'], 'Point'],
        layout: {
          'text-field': name,
          'text-font': FONT.italic,
          'text-size': ['match', ['get', 'class'], 'ocean', 16, 'sea', 13, 11],
          'text-max-width': 8,
          'text-letter-spacing': 0.08,
        },
        paint: { ...labelPaint(t), 'text-color': t.waterText, 'text-halo-width': 1 },
      },
      {
        id: 'label-waterway',
        type: 'symbol',
        source: SOURCE,
        'source-layer': 'waterway',
        minzoom: 12,
        layout: {
          'symbol-placement': 'line',
          'text-field': name,
          'text-font': FONT.italic,
          'text-size': 11,
        },
        paint: { ...labelPaint(t), 'text-color': t.waterText, 'text-halo-width': 1 },
      },
    );
  }
  if (labels.pois) {
    layers.push({
      id: 'label-poi',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'poi',
      minzoom: 15,
      filter: ['<=', ['coalesce', ['get', 'rank'], 99], 20],
      layout: {
        'text-field': name,
        'text-font': FONT.regular,
        'text-size': 11,
        'text-max-width': 8,
      },
      paint: labelPaint(t, 0.85),
    });
  }
  if (labels.villages) {
    layers.push(
      placeLabel(t, name, 'label-village', ['village', 'hamlet', 'suburb', 'quarter'], {
        minzoom: 10,
        size: ['interpolate', ['linear'], ['zoom'], 10, 11, 15, 14],
      }),
    );
  }
  if (labels.towns) {
    layers.push(
      placeLabel(t, name, 'label-town', ['town'], {
        minzoom: 7,
        size: ['interpolate', ['linear'], ['zoom'], 7, 11, 12, 15],
      }),
    );
  }
  if (labels.cities) {
    layers.push(
      placeLabel(t, name, 'label-city', ['city'], {
        minzoom: 3,
        size: ['interpolate', ['linear'], ['zoom'], 3, 11, 8, 16, 12, 20],
        font: FONT.bold,
      }),
    );
  }
  if (labels.states) {
    layers.push(
      placeLabel(t, name, 'label-state', ['state', 'province'], {
        minzoom: 4,
        maxzoom: 9,
        size: ['interpolate', ['linear'], ['zoom'], 4, 9, 8, 12],
        upper: true,
        opacity: 0.7,
      }),
    );
  }
  if (labels.countries) {
    layers.push(
      placeLabel(t, name, 'label-country', ['country'], {
        minzoom: 1,
        maxzoom: 9,
        size: ['interpolate', ['linear'], ['zoom'], 1, 10, 4, 14, 7, 18],
        font: FONT.bold,
        upper: true,
      }),
    );
  }
  return layers;
}

function vectorLayers(theme: Theme, style: MapStyleRef, options: BuildStyleOptions) {
  const t = effectiveTokens(theme, style);
  const { layers } = theme;
  const out: LayerSpecification[] = [
    { id: 'background', type: 'background', paint: { 'background-color': t.land } },
  ];
  if (layers.relief) {
    out.push({
      id: 'relief',
      type: 'raster',
      source: 'relief',
      maxzoom: 8,
      // Only the shading: the theme's colours stay in charge.
      paint: {
        'raster-saturation': -1,
        'raster-contrast': 0.1,
        'raster-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.28, 6, 0.18, 8, 0],
      },
    });
  }
  if (layers.landcover) {
    out.push({
      id: 'landcover',
      type: 'fill',
      source: SOURCE,
      'source-layer': 'landcover',
      filter: classIn('wood', 'grass', 'wetland', 'farmland'),
      paint: {
        'fill-color': t.landcover,
        'fill-opacity': ['match', ['get', 'class'], 'farmland', 0.35, 0.7],
      },
    });
  }
  out.push(
    {
      id: 'ice',
      type: 'fill',
      source: SOURCE,
      'source-layer': 'landcover',
      filter: classIn('ice', 'glacier'),
      paint: { 'fill-color': t.ice, 'fill-opacity': 0.9 },
    },
    {
      id: 'urban',
      type: 'fill',
      source: SOURCE,
      'source-layer': 'landuse',
      filter: classIn(
        'residential',
        'suburb',
        'quarter',
        'neighbourhood',
        'commercial',
        'industrial',
        'retail',
      ),
      paint: {
        'fill-color': t.urban,
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0, 9, 0.8],
      },
    },
    {
      id: 'park',
      type: 'fill',
      source: SOURCE,
      'source-layer': 'park',
      paint: { 'fill-color': t.park, 'fill-opacity': 0.6 },
    },
    {
      id: 'water',
      type: 'fill',
      source: SOURCE,
      'source-layer': 'water',
      filter: ['!=', ['get', 'brunnel'], 'tunnel'],
      paint: { 'fill-color': t.water },
    },
    {
      id: 'waterway',
      type: 'line',
      source: SOURCE,
      'source-layer': 'waterway',
      minzoom: 7,
      filter: ['!=', ['get', 'brunnel'], 'tunnel'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': t.water,
        'line-width': [
          'interpolate',
          ['exponential', 1.4],
          ['zoom'],
          7,
          ['match', ['get', 'class'], 'river', 0.8, 0],
          12,
          ['match', ['get', 'class'], 'river', 2.5, 'canal', 1.5, 0.6],
          18,
          ['match', ['get', 'class'], 'river', 14, 'canal', 8, 3],
        ],
      },
    },
    {
      id: 'aeroway',
      type: 'line',
      source: SOURCE,
      'source-layer': 'aeroway',
      minzoom: 10,
      filter: ['all', ['==', ['geometry-type'], 'LineString'], classIn('runway', 'taxiway')],
      paint: {
        'line-color': t.roadMinor,
        'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 10, 1, 14, 8, 18, 60],
      },
    },
  );
  if (layers.buildings) {
    out.push(
      options.buildings3d
        ? {
            id: 'building',
            type: 'fill-extrusion',
            source: SOURCE,
            'source-layer': 'building',
            minzoom: 13,
            paint: {
              'fill-extrusion-color': t.building,
              'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
              'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
              'fill-extrusion-opacity': 0.85,
            },
          }
        : {
            id: 'building',
            type: 'fill',
            source: SOURCE,
            'source-layer': 'building',
            minzoom: 13,
            paint: {
              'fill-color': t.building,
              'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, 1],
            },
          },
    );
  }
  out.push(...roadsLayers(t, layers.minorRoads));
  if (layers.boundaries) {
    const onLand: ExpressionSpecification = ['!=', ['get', 'maritime'], 1];
    out.push(
      {
        id: 'boundary-state',
        type: 'line',
        source: SOURCE,
        'source-layer': 'boundary',
        minzoom: 4,
        filter: ['all', ['==', ['get', 'admin_level'], 4], onLand],
        paint: {
          'line-color': t.boundary,
          'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 10, 1.2],
          'line-dasharray': [3, 2],
          'line-opacity': 0.6,
        },
      },
      {
        id: 'boundary-country',
        type: 'line',
        source: SOURCE,
        'source-layer': 'boundary',
        filter: ['all', ['==', ['get', 'admin_level'], 2], onLand],
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': t.boundary,
          'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.6, 6, 1.4, 12, 2.5],
        },
      },
    );
  }
  out.push(...labelLayers(t, effectiveLabels(theme, style), nameIn(style.language)));
  return out;
}

function insertBefore(layers: LayerSpecification[], id: string, extra: LayerSpecification[]) {
  const at = layers.findIndex((layer) => layer.id === id);
  layers.splice(at < 0 ? layers.length : at, 0, ...extra);
}

/**
 * The ground of a vector map (ADR 0012). The terrain base gets the colour relief right above
 * the background, the hillshade under the water and the contour lines above it; other vector
 * maps get a subtle hillshade under 3D terrain, without which the mountains look flat.
 */
function addGround(
  layers: LayerSpecification[],
  style: MapStyleRef,
  theme: Theme,
  options: BuildStyleOptions,
): void {
  const t = effectiveTokens(theme, style);
  if (style.base === 'terrain') {
    insertBefore(layers, 'landcover', [colorReliefLayer(t)]);
    insertBefore(layers, 'water', [hillshadeLayer(t, 0.6)]);
    if (options.contourTiles) insertBefore(layers, 'waterway', contourLayers(t, FONT.regular));
  } else if (options.terrain) {
    insertBefore(layers, 'water', [hillshadeLayer(t, 0.35)]);
  }
}

/** Satellite as a raster from our server; hybrid adds roads, borders and white labels on top. */
function satelliteLayers(hybrid: boolean, style: MapStyleRef, theme: Theme): LayerSpecification[] {
  const out: LayerSpecification[] = [
    { id: 'background', type: 'background', paint: { 'background-color': '#0b0f14' } },
    { id: 'satellite', type: 'raster', source: 'satellite' },
  ];
  if (!hybrid) return out;
  const t: ThemeTokens = {
    ...theme.tokens,
    roadMotorway: '#ffd27a',
    roadMajor: '#ffffff',
    roadMinor: '#ffffff',
    roadCasing: '#000000',
    rail: '#dddddd',
    boundary: '#ffffff',
    labelText: '#ffffff',
    labelHalo: '#000000',
    waterText: '#d6ecff',
  };
  const roads = roadsLayers(t, false)
    .filter((layer) => layer.id === 'road')
    .map(
      (layer) =>
        ({ ...layer, paint: { ...layer.paint, 'line-opacity': 0.55 } }) as LayerSpecification,
    );
  return [
    ...out,
    ...roads,
    {
      id: 'boundary-country',
      type: 'line',
      source: SOURCE,
      'source-layer': 'boundary',
      filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
      paint: { 'line-color': t.boundary, 'line-width': 1.2, 'line-opacity': 0.7 },
    },
    ...labelLayers(t, effectiveLabels(theme, style), nameIn(style.language)),
  ];
}

/** The style a stage's map is drawn with. A pure function of its inputs, so preview and export agree. */
export function buildStyle(
  style: MapStyleRef,
  theme: Theme,
  options: BuildStyleOptions = {},
): StyleSpecification {
  const satellite = style.base === 'satellite' || style.base === 'satellite-hybrid';
  if (options.transparent) {
    // The glyphs stay: the scene's stop names are drawn by the map too.
    return {
      version: 8,
      name: 'overlay',
      glyphs: `${OPENFREEMAP}/fonts/{fontstack}/{range}.pbf`,
      sources: options.terrain ? { [TERRAIN_SOURCE]: demSource() } : {},
      layers: [],
      ...(options.terrain && {
        terrain: { source: TERRAIN_SOURCE, exaggeration: options.terrain.exaggeration },
      }),
    };
  }
  const sources: Record<string, SourceSpecification> = {
    [SOURCE]: { type: 'vector', url: `${OPENFREEMAP}/planet` },
  };
  if (!satellite && theme.layers.relief) {
    sources.relief = {
      type: 'raster',
      tiles: [`${OPENFREEMAP}/natural_earth/ne2sr/{z}/{x}/{y}.png`],
      tileSize: 256,
      maxzoom: 6,
    };
  }
  if ((satellite || options.satelliteMix) && options.serverUrl) {
    // Through our server: the MapTiler key never reaches the browser (ADR 0010).
    sources.satellite = {
      type: 'raster',
      url: `${options.serverUrl}/api/tiles/satellite/tiles.json`,
      tileSize: 512,
    };
  }
  const layers = satellite
    ? satelliteLayers(style.base === 'satellite-hybrid', style, theme).filter(
        (layer) => layer.id !== 'satellite' || sources.satellite,
      )
    : vectorLayers(theme, style, options);
  if (!satellite) addGround(layers, style, theme, options);
  if (layers.some((layer) => 'source' in layer && layer.source === RELIEF_SOURCE)) {
    sources[RELIEF_SOURCE] = demSource();
  }
  if (layers.some((layer) => 'source' in layer && layer.source === CONTOUR_SOURCE)) {
    sources[CONTOUR_SOURCE] = { type: 'vector', tiles: [options.contourTiles!], maxzoom: 15 };
  }
  if (options.terrain) sources[TERRAIN_SOURCE] = demSource();
  if (!satellite && options.satelliteMix && sources.satellite) {
    // Over everything of the base map, labels included; the route stays on top of it.
    layers.push({
      id: SATELLITE_MIX_LAYER,
      type: 'raster',
      source: 'satellite',
      paint: { 'raster-opacity': 0, 'raster-fade-duration': 0 },
    });
  }
  return {
    version: 8,
    name: satellite ? style.base : theme.name,
    glyphs: `${OPENFREEMAP}/fonts/{fontstack}/{range}.pbf`,
    sources,
    layers,
    ...(options.terrain && {
      terrain: { source: TERRAIN_SOURCE, exaggeration: options.terrain.exaggeration },
    }),
  };
}

/** The globe's atmosphere in the theme's colours: water for the sky, land at the horizon. */
export function skyOf(
  style: MapStyleRef,
  theme: Theme,
): Pick<SkySpecification, 'sky-color' | 'horizon-color'> {
  if (style.base === 'satellite' || style.base === 'satellite-hybrid') {
    return { 'sky-color': '#5d8fd0', 'horizon-color': '#cfe2f5' };
  }
  const t = effectiveTokens(theme, style);
  return { 'sky-color': t.water, 'horizon-color': t.land };
}

/** The colour around the picture: behind the globe and while tiles load. */
export function backgroundOf(style: MapStyleRef, theme: Theme): string {
  return style.base === 'satellite' || style.base === 'satellite-hybrid'
    ? '#0b0f14'
    : effectiveTokens(theme, style).background;
}
