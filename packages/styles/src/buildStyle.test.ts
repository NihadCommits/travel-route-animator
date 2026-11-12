import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { ThemeSchema, type MapStyleRef, type Theme } from '@travel-route-animator/core';
import { describe, expect, it } from 'vitest';
import { buildStyle, effectiveLabels, skyOf, backgroundOf } from './buildStyle';
import {
  MAPTILER_ATTRIBUTION,
  NATURAL_EARTH_ATTRIBUTION,
  OPENFREEMAP_ATTRIBUTION,
  styleCredits,
} from './credits';
import { BUILT_IN_THEMES, DEFAULT_THEME_ID, resolveTheme } from './themes';

const vector: MapStyleRef = { base: 'vector' };
const layerIds = (style: ReturnType<typeof buildStyle>) => style.layers.map((layer) => layer.id);
const clean = resolveTheme('clean-light').theme;

describe('built-in themes', () => {
  it('are valid themes with their own IDs', () => {
    for (const theme of BUILT_IN_THEMES) expect(ThemeSchema.parse(theme)).toEqual(theme);
    const ids = BUILT_IN_THEMES.map((theme) => theme.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(DEFAULT_THEME_ID);
  });

  it('give valid MapLibre styles, flat, with 3D buildings and as satellite', () => {
    for (const theme of BUILT_IN_THEMES) {
      for (const [style, buildings3d] of [
        [vector, false],
        [vector, true],
        [{ base: 'satellite-hybrid' }, false],
      ] as const) {
        const built = buildStyle(style, theme, { buildings3d, serverUrl: 'http://127.0.0.1:5174' });
        expect(validateStyleMin(built), `${theme.id} ${style.base}`).toEqual([]);
      }
    }
  });
});

describe('resolveTheme', () => {
  it('finds built-in and own themes and falls back to the default for missing ones', () => {
    const own: Theme = { ...clean, id: 'my-sunset', name: 'Sonnenuntergang' };
    expect(resolveTheme('night').theme.id).toBe('night');
    expect(resolveTheme(undefined)).toEqual({ theme: clean, missing: false });
    expect(resolveTheme('my-sunset', { 'my-sunset': own })).toEqual({ theme: own, missing: false });
    expect(resolveTheme('my-sunset')).toEqual({ theme: clean, missing: true });
  });
});

describe('buildStyle', () => {
  it('paints the map in the theme colours, with the style overrides on top', () => {
    const style = buildStyle({ base: 'vector', overrides: { water: '#123456' } }, clean);
    const water = style.layers.find((layer) => layer.id === 'water');
    expect(water).toMatchObject({ paint: { 'fill-color': '#123456' } });
    expect(style.layers[0]).toMatchObject({ paint: { 'background-color': clean.tokens.land } });
  });

  it('leaves out label kinds the style switches off; all off is a clean map', () => {
    const all = layerIds(
      buildStyle({ base: 'vector', labels: { pois: true, states: true } }, clean),
    );
    expect(all.filter((id) => id.startsWith('label-'))).toEqual([
      'label-road',
      'label-water',
      'label-waterway',
      'label-poi',
      'label-village',
      'label-town',
      'label-city',
      'label-state',
      'label-country',
    ]);
    const cleanMap: MapStyleRef = {
      base: 'vector',
      labels: {
        countries: false,
        states: false,
        cities: false,
        towns: false,
        villages: false,
        roads: false,
        water: false,
        pois: false,
      },
    };
    expect(layerIds(buildStyle(cleanMap, clean)).some((id) => id.startsWith('label-'))).toBe(false);
    // One kind back on, the rest stays off.
    const citiesOnly = { ...cleanMap, labels: { ...cleanMap.labels, cities: true } };
    expect(effectiveLabels(clean, citiesOnly)).toMatchObject({ cities: true, towns: false });
    expect(layerIds(buildStyle(citiesOnly, clean)).filter((id) => id.startsWith('label-'))).toEqual(
      ['label-city'],
    );
  });

  it('writes place names in the country language unless the style asks for German or English', () => {
    const cityName = (style: MapStyleRef) => {
      const city = buildStyle(style, clean).layers.find((layer) => layer.id === 'label-city');
      return city?.type === 'symbol' ? city.layout?.['text-field'] : undefined;
    };
    expect(cityName(vector)).toEqual(['coalesce', ['get', 'name'], ['get', 'name:latin']]);
    expect(cityName({ ...vector, language: 'de' })).toEqual([
      'coalesce',
      ['get', 'name:de'],
      ['get', 'name:latin'],
      ['get', 'name'],
    ]);
    expect(JSON.stringify(cityName({ ...vector, language: 'en' }))).toContain('name:en');
  });

  it('follows the theme layers: no minor roads, buildings or relief on the old globe', () => {
    const oldGlobe = resolveTheme('old-globe').theme;
    const style = buildStyle(vector, oldGlobe);
    expect(layerIds(style)).not.toContain('building');
    expect(layerIds(style)).toContain('relief');
    const road = style.layers.find((l) => l.id === 'road');
    expect(JSON.stringify(road && 'filter' in road ? road.filter : null)).not.toContain('service');
    expect(Object.keys(style.sources)).toEqual(['openmaptiles', 'relief']);
    const extruded = buildStyle(vector, clean, { buildings3d: true });
    expect(extruded.layers.find((l) => l.id === 'building')?.type).toBe('fill-extrusion');
  });

  it('takes satellite tiles from our server, never straight from the provider', () => {
    const style = buildStyle({ base: 'satellite' }, clean, { serverUrl: 'http://127.0.0.1:5174' });
    expect(style.sources.satellite).toEqual({
      type: 'raster',
      url: 'http://127.0.0.1:5174/api/tiles/satellite/tiles.json',
      tileSize: 512,
    });
    expect(layerIds(style)).toEqual(['background', 'satellite']);
    // Without a server there is nothing to show but the background.
    expect(layerIds(buildStyle({ base: 'satellite' }, clean))).toEqual(['background']);
    expect(layerIds(buildStyle({ base: 'satellite-hybrid' }, clean))).toContain('label-city');
    expect(backgroundOf({ base: 'satellite' }, clean)).toBe('#0b0f14');
    expect(skyOf(vector, clean)).toEqual({
      'sky-color': clean.tokens.water,
      'horizon-color': clean.tokens.land,
    });
  });
});

describe('styleCredits', () => {
  it('credits every source the map draws from', () => {
    expect(styleCredits(vector, clean)).toEqual([OPENFREEMAP_ATTRIBUTION]);
    expect(styleCredits(vector, resolveTheme('rustic').theme)).toEqual([
      OPENFREEMAP_ATTRIBUTION,
      NATURAL_EARTH_ATTRIBUTION,
    ]);
    expect(styleCredits({ base: 'satellite' }, clean)).toEqual([MAPTILER_ATTRIBUTION]);
    expect(styleCredits({ base: 'satellite-hybrid' }, clean)).toEqual([
      MAPTILER_ATTRIBUTION,
      OPENFREEMAP_ATTRIBUTION,
    ]);
  });
});
